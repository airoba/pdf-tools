<script setup lang="ts">
import { Delete, Download, Document, Plus, Rank, Top, Bottom } from "@element-plus/icons-vue";
import { PDFDocument } from "pdf-lib";
import { computed, ref, onBeforeUnmount } from "vue";
import { useTaskStore } from "@/stores/task";

type MixedItem = {
  id: string;
  file: File;
  name: string;
  size: number;
  kind: "pdf" | "image";
  pageCount: number;
  width: number;
  height: number;
  thumbnail: string;
  status: "ready" | "loading" | "error";
  errorMessage?: string;
};

const taskStore = useTaskStore();
const fileInput = ref<HTMLInputElement | null>(null);
const items = ref<MixedItem[]>([]);
const isImporting = ref(false);
const isMerging = ref(false);
const errorText = ref("");
const draggingId = ref("");
const dragOverId = ref("");

const totalPages = computed(() => items.value.reduce((sum, item) => sum + (item.status === "ready" ? item.pageCount : 0), 0));
const readyItems = computed(() => items.value.filter((item) => item.status === "ready"));
const canMerge = computed(() => readyItems.value.length >= 2 && !isImporting.value && !isMerging.value);
const isTaskRunning = computed(() => isImporting.value || isMerging.value);

function fileId(file: File) {
  return [file.name, file.size, file.lastModified].join(":");
}

function formatSize(size: number) {
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + " KB";
  return (size / 1024 / 1024).toFixed(2) + " MB";
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function isImage(file: File) {
  return file.type === "image/png" || file.type === "image/jpeg" || /\.(png|jpe?g)$/i.test(file.name);
}

function isPng(file: File) {
  return file.type === "image/png" || /\.png$/i.test(file.name);
}

function normalizePdfError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/encrypted|encryption|password|PDFDict|undefined/i.test(message)) {
    return "该 PDF 可阅读，但包含权限加密或非标准对象结构，当前浏览器合并引擎无法复制页面。可用 WPS/Adobe 另存为新 PDF 后再试。";
  }
  if (/invalid|parse|failed|load/i.test(message)) {
    return "文件解析失败，请确认这是有效的 PDF 文件。";
  }
  if (message === "empty-pdf") return "该 PDF 没有可合并的页面。";
  return message || "文件处理失败";
}

function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片读取失败"));
    };
    image.src = url;
  });
}

async function loadPdf(file: File) {
  const bytes = await file.arrayBuffer();
  return PDFDocument.load(bytes, { ignoreEncryption: true });
}

function chooseFiles() {
  if (isTaskRunning.value) return;
  fileInput.value?.click();
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const selected = Array.from(input.files ?? []);
  if (!selected.length) return;

  isImporting.value = true;
  errorText.value = "";
  taskStore.statusText = "正在读取文件";

  try {
    const existingIds = new Set(items.value.map((item) => item.id));
    const candidates = selected.filter((file) => (isPdf(file) || isImage(file)) && !existingIds.has(fileId(file)));
    let skipped = selected.length - candidates.length;

    for (const file of candidates) {
      const kind = isPdf(file) ? "pdf" : "image";
      const item: MixedItem = {
        id: fileId(file),
        file,
        name: file.name,
        size: file.size,
        kind,
        pageCount: 0,
        width: 0,
        height: 0,
        thumbnail: kind === "image" ? URL.createObjectURL(file) : "",
        status: "loading",
      };
      items.value.push(item);

      try {
        if (kind === "pdf") {
          const pdf = await loadPdf(file);
          const pageCount = pdf.getPageCount();
          if (!pageCount) throw new Error("empty-pdf");
          const testDocument = await PDFDocument.create();
          await testDocument.copyPages(pdf, [0]);
          item.pageCount = pageCount;
        } else {
          const { width, height } = await readImageSize(file);
          item.width = width;
          item.height = height;
          item.pageCount = 1;
        }
        item.status = "ready";
      } catch (error) {
        item.status = "error";
        item.errorMessage = kind === "pdf" ? normalizePdfError(error) : error instanceof Error ? error.message : "图片读取失败";
      }
    }

    if (skipped > 0) {
      errorText.value = "已忽略 " + skipped + " 个重复或非 PDF/PNG/JPG 文件。";
    }
    taskStore.statusText = items.value.length ? "已导入 " + items.value.length + " 个文件" : "未选择文件";
  } finally {
    isImporting.value = false;
    input.value = "";
  }
}

function reorderFile(fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
  const next = [...items.value];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  items.value = next;
}

function moveFile(index: number, direction: -1 | 1) {
  if (isTaskRunning.value) return;
  reorderFile(index, index + direction);
}

function onDragStart(event: DragEvent, item: MixedItem) {
  if (isTaskRunning.value) return;
  draggingId.value = item.id;
  event.dataTransfer?.setData("text/plain", item.id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

function onDragOver(event: DragEvent, item: MixedItem) {
  if (isTaskRunning.value || !draggingId.value || draggingId.value === item.id) return;
  event.preventDefault();
  dragOverId.value = item.id;
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
}

function onDrop(event: DragEvent, item: MixedItem) {
  if (isTaskRunning.value) return;
  event.preventDefault();
  const sourceId = event.dataTransfer?.getData("text/plain") || draggingId.value;
  const fromIndex = items.value.findIndex((file) => file.id === sourceId);
  const toIndex = items.value.findIndex((file) => file.id === item.id);
  reorderFile(fromIndex, toIndex);
  draggingId.value = "";
  dragOverId.value = "";
}

function onDragEnd() {
  draggingId.value = "";
  dragOverId.value = "";
}

function removeFile(index: number) {
  if (isTaskRunning.value) return;
  const item = items.value[index];
  if (item?.thumbnail) URL.revokeObjectURL(item.thumbnail);
  items.value.splice(index, 1);
  taskStore.statusText = items.value.length ? "已导入 " + items.value.length + " 个文件" : "未选择文件";
}

function clearFiles() {
  if (isTaskRunning.value) return;
  for (const item of items.value) if (item.thumbnail) URL.revokeObjectURL(item.thumbnail);
  items.value = [];
  errorText.value = "";
  taskStore.statusText = "未选择文件";
}

function buildTimestamp() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    now.getFullYear() + "-" +
    pad(now.getMonth() + 1) + "-" +
    pad(now.getDate()) + "-" +
    pad(now.getHours()) + "-" +
    pad(now.getMinutes()) + "-" +
    pad(now.getSeconds())
  );
}

async function mergeAll() {
  if (!canMerge.value) return;
  isMerging.value = true;
  errorText.value = "";
  taskStore.statusText = "正在合并文件";

  try {
    const target = await PDFDocument.create();
    for (const item of readyItems.value) {
      if (item.kind === "pdf") {
        try {
          const source = await loadPdf(item.file);
          const copiedPages = await target.copyPages(source, source.getPageIndices());
          copiedPages.forEach((page) => target.addPage(page));
        } catch (error) {
          item.status = "error";
          item.errorMessage = normalizePdfError(error);
          throw error;
        }
      } else {
        const bytes = await item.file.arrayBuffer();
        const image = isPng(item.file) ? await target.embedPng(bytes) : await target.embedJpg(bytes);
        const page = target.addPage([image.width, image.height]);
        page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      }
    }

    const output = await target.save();
    const blob = new Blob([new Uint8Array(output)], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "合并文件-" + buildTimestamp() + ".pdf";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 3000);
    taskStore.statusText = "已合并 " + readyItems.value.length + " 个文件，共 " + totalPages.value + " 页";
  } catch (error) {
    errorText.value = normalizePdfError(error);
    taskStore.statusText = "合并失败";
  } finally {
    isMerging.value = false;
  }
}

onBeforeUnmount(() => {
  for (const item of items.value) if (item.thumbnail) URL.revokeObjectURL(item.thumbnail);
});
</script>

<template>
  <input ref="fileInput" class="hidden-input" type="file" accept="application/pdf,.pdf,image/png,image/jpeg" multiple @change="onFileChange" />

  <section class="merge-page">
    <aside class="glass-panel merge-sidebar">
      <div>
        <h1>混合合并</h1>
        <p>把图片和 PDF 一起拖入，按自定义顺序合并成一份新的 PDF 文件。</p>
      </div>

      <el-button class="merge-button" type="primary" :icon="Plus" :loading="isImporting" :disabled="isMerging" @click="chooseFiles">
        添加文件
      </el-button>

      <div class="merge-summary" :class="{ empty: !items.length }">
        <strong>{{ items.length ? items.length + " 个文件" : "尚未选择文件" }}</strong>
        <span>{{ items.length ? totalPages + " 页 · " + readyItems.length + " 个可合并" : "图片与 PDF 均可，至少 2 个文件" }}</span>
      </div>

      <div class="merge-rules">
        <p class="eyebrow">合并规则</p>
        <span>按列表顺序合并</span>
        <span>图片每张对应一页</span>
        <span>PDF 保留全部页面</span>
        <span>支持拖拽调整顺序</span>
        <span>所有处理均在本地完成</span>
      </div>

      <p v-if="errorText" class="form-error">{{ errorText }}</p>

      <el-button class="merge-action" type="primary" :icon="Download" :loading="isMerging" :disabled="!canMerge" @click="mergeAll">
        开始合并
      </el-button>
    </aside>

    <section class="glass-panel merge-list-panel">
      <div class="merge-heading">
        <div>
          <h2>合并顺序</h2>
        </div>
        <div class="merge-heading-actions">
          <el-button :loading="isImporting" :disabled="isTaskRunning || !items.length" @click="chooseFiles">继续添加</el-button>
          <el-button :disabled="isTaskRunning || !items.length" @click="clearFiles">清空</el-button>
        </div>
      </div>

      <div v-if="!items.length" class="merge-empty">
        <strong>还没有待合并的文件</strong>
        <span>点击左侧“添加文件”导入图片或 PDF。</span>
      </div>

      <div v-else class="merge-file-list">
        <article
          v-for="(item, index) in items"
          :key="item.id"
          class="merge-file-row mixed-file-row"
          :class="[item.status, { dragging: draggingId === item.id, 'drag-over': dragOverId === item.id }]"
          :draggable="!isTaskRunning"
          @dragstart="onDragStart($event, item)"
          @dragover="onDragOver($event, item)"
          @dragleave="dragOverId = ''"
          @drop="onDrop($event, item)"
          @dragend="onDragEnd"
        >
          <div class="merge-drag-handle" title="拖拽调整顺序"><el-icon><Rank /></el-icon></div>
          <div class="merge-index">{{ index + 1 }}</div>
          <div class="mixed-thumb" :class="item.kind">
            <img v-if="item.thumbnail" :src="item.thumbnail" :alt="item.name" />
            <el-icon v-else><Document /></el-icon>
          </div>
          <div class="merge-file-main">
            <strong>{{ item.name }}</strong>
            <span v-if="item.status === 'ready' && item.kind === 'pdf'">{{ item.pageCount }} 页 · {{ formatSize(item.size) }}</span>
            <span v-else-if="item.status === 'ready'">{{ item.width }} × {{ item.height }} · {{ formatSize(item.size) }}</span>
            <span v-else-if="item.status === 'loading'">正在读取...</span>
            <span v-else>{{ item.errorMessage || "文件不可用" }}</span>
          </div>
          <el-tag v-if="item.kind === 'pdf'" effect="plain">PDF</el-tag>
          <el-tag v-else effect="plain" type="info">图片</el-tag>
          <div class="merge-row-actions">
            <el-button :icon="Top" circle size="small" aria-label="上移" :disabled="isTaskRunning || index === 0" @click="moveFile(index, -1)" />
            <el-button :icon="Bottom" circle size="small" aria-label="下移" :disabled="isTaskRunning || index === items.length - 1" @click="moveFile(index, 1)" />
            <el-button :icon="Delete" circle size="small" aria-label="删除" :disabled="isTaskRunning" @click="removeFile(index)" />
          </div>
        </article>
      </div>
    </section>
  </section>
</template>
