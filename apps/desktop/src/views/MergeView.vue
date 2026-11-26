<script setup lang="ts">
import { Delete, Download, Plus, Rank, Top, Bottom } from "@element-plus/icons-vue";
import { PDFDocument } from "pdf-lib";
import { computed, ref } from "vue";
import { useTaskStore } from "@/stores/task";

type MergeFile = {
  id: string;
  file: File;
  name: string;
  size: number;
  pageCount: number;
  status: "ready" | "loading" | "error";
  errorMessage?: string;
};

const taskStore = useTaskStore();
const fileInput = ref<HTMLInputElement | null>(null);
const files = ref<MergeFile[]>([]);
const isImporting = ref(false);
const isMerging = ref(false);
const errorText = ref("");
const draggingId = ref("");
const dragOverId = ref("");

const totalPages = computed(() => files.value.reduce((sum, item) => sum + item.pageCount, 0));
const readyFiles = computed(() => files.value.filter((item) => item.status === "ready"));
const canMerge = computed(() => readyFiles.value.length >= 2 && !isImporting.value && !isMerging.value);
const isTaskRunning = computed(() => isImporting.value || isMerging.value);

function fileId(file: File) {
  return [file.name, file.size, file.lastModified].join(":");
}

function formatSize(size: number) {
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + " KB";
  return (size / 1024 / 1024).toFixed(2) + " MB";
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

async function loadPdf(file: File) {
  const bytes = await file.arrayBuffer();
  return PDFDocument.load(bytes, { ignoreEncryption: true });
}

function chooseFiles() {
  if (isTaskRunning.value) return;
  fileInput.value?.click();
}

async function inspectPdfFile(file: File) {
  const pdf = await loadPdf(file);
  const pageCount = pdf.getPageCount();
  if (!pageCount) throw new Error("empty-pdf");

  const testDocument = await PDFDocument.create();
  await testDocument.copyPages(pdf, [0]);
  return pageCount;
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const selected = Array.from(input.files ?? []);
  if (!selected.length) return;

  isImporting.value = true;
  errorText.value = "";
  taskStore.statusText = "正在读取 PDF 文件";

  try {
    const existingIds = new Set(files.value.map((item) => item.id));
    const candidates = selected.filter((file) => {
      const valid = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      return valid && !existingIds.has(fileId(file));
    });

    for (const file of candidates) {
      const item: MergeFile = {
        id: fileId(file),
        file,
        name: file.name,
        size: file.size,
        pageCount: 0,
        status: "loading",
      };
      files.value.push(item);

      try {
        item.pageCount = await inspectPdfFile(file);
        item.status = "ready";
      } catch (error) {
        item.status = "error";
        item.errorMessage = normalizePdfError(error);
      }
    }

    if (selected.length && !candidates.length) {
      errorText.value = "没有新增有效 PDF，重复或非 PDF 文件已自动忽略。";
    }
    taskStore.statusText = files.value.length ? "已导入 " + files.value.length + " 个 PDF" : "未选择文件";
  } finally {
    isImporting.value = false;
    input.value = "";
  }
}

function reorderFile(fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
  const next = [...files.value];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  files.value = next;
}

function moveFile(index: number, direction: -1 | 1) {
  if (isTaskRunning.value) return;
  reorderFile(index, index + direction);
}

function onDragStart(event: DragEvent, item: MergeFile) {
  if (isTaskRunning.value) return;
  draggingId.value = item.id;
  event.dataTransfer?.setData("text/plain", item.id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

function onDragOver(event: DragEvent, item: MergeFile) {
  if (isTaskRunning.value || !draggingId.value || draggingId.value === item.id) return;
  event.preventDefault();
  dragOverId.value = item.id;
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
}

function onDrop(event: DragEvent, item: MergeFile) {
  if (isTaskRunning.value) return;
  event.preventDefault();
  const sourceId = event.dataTransfer?.getData("text/plain") || draggingId.value;
  const fromIndex = files.value.findIndex((file) => file.id === sourceId);
  const toIndex = files.value.findIndex((file) => file.id === item.id);
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
  files.value.splice(index, 1);
  taskStore.statusText = files.value.length ? "已导入 " + files.value.length + " 个 PDF" : "未选择文件";
}

function clearFiles() {
  if (isTaskRunning.value) return;
  files.value = [];
  errorText.value = "";
  taskStore.statusText = "未选择文件";
}

async function mergePdf() {
  if (!canMerge.value) return;
  isMerging.value = true;
  errorText.value = "";
  taskStore.statusText = "正在合并 PDF 文件";

  try {
    const target = await PDFDocument.create();
    for (const item of readyFiles.value) {
      try {
        const source = await loadPdf(item.file);
        const copiedPages = await target.copyPages(source, source.getPageIndices());
        copiedPages.forEach((page) => target.addPage(page));
      } catch (error) {
        item.status = "error";
        item.errorMessage = normalizePdfError(error);
        throw error;
      }
    }

    const output = await target.save();
    const blob = new Blob([new Uint8Array(output)], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    link.href = url;
    link.download = "合并文件-" + timestamp + ".pdf";
    link.click();
    URL.revokeObjectURL(url);
    taskStore.statusText = "已合并 " + readyFiles.value.length + " 个 PDF，共 " + totalPages.value + " 页";
  } catch (error) {
    errorText.value = normalizePdfError(error);
    taskStore.statusText = "合并失败";
  } finally {
    isMerging.value = false;
  }
}
</script>

<template>
  <input ref="fileInput" class="hidden-input" type="file" accept="application/pdf,.pdf" multiple @change="onFileChange" />

  <section class="merge-page">
    <aside class="glass-panel merge-sidebar">
      <div>
        <h1>PDF 文件合并</h1>
        <p>批量选择本地 PDF，拖拽调整顺序后生成一份新的 PDF 文件。</p>
      </div>

      <el-button class="merge-button" type="primary" :icon="Plus" :loading="isImporting" :disabled="isMerging" @click="chooseFiles">
        添加 PDF
      </el-button>

      <div class="merge-summary" :class="{ empty: !files.length }">
        <strong>{{ files.length ? files.length + " 个文件" : "尚未选择文件" }}</strong>
        <span>{{ files.length ? totalPages + " 页 · " + readyFiles.length + " 个可合并" : "至少需要 2 个有效 PDF" }}</span>
      </div>

      <div class="merge-rules">
        <p class="eyebrow">合并规则</p>
        <span>按列表顺序合并</span>
        <span>支持拖拽调整顺序</span>
        <span>重复文件自动忽略</span>
        <span>所有处理均在本地完成</span>
      </div>

      <p v-if="errorText" class="form-error">{{ errorText }}</p>

      <el-button class="merge-action" type="primary" :icon="Download" :loading="isMerging" :disabled="!canMerge" @click="mergePdf">
        开始合并
      </el-button>
    </aside>

    <section class="glass-panel merge-list-panel">
      <div class="merge-heading">
        <div>
          <h2>合并顺序</h2>
        </div>
        <div class="merge-heading-actions">
          <el-button :loading="isImporting" :disabled="isTaskRunning || !files.length" @click="chooseFiles">继续添加</el-button>
          <el-button :disabled="isTaskRunning || !files.length" @click="clearFiles">清空</el-button>
        </div>
      </div>

      <div v-if="!files.length" class="merge-empty">
        <strong>还没有待合并的 PDF</strong>
        <span>点击左侧“添加 PDF”导入多个文件。</span>
      </div>

      <div v-else class="merge-file-list">
        <article
          v-for="(item, index) in files"
          :key="item.id"
          class="merge-file-row"
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
          <div class="merge-file-main">
            <strong>{{ item.name }}</strong>
            <span v-if="item.status === 'ready'">{{ item.pageCount }} 页 · {{ formatSize(item.size) }}</span>
            <span v-else-if="item.status === 'loading'">正在读取页数...</span>
            <span v-else>{{ item.errorMessage || "文件不可用" }}</span>
          </div>
          <el-tag v-if="item.status === 'ready'" effect="plain" type="success">可合并</el-tag>
          <el-tag v-else-if="item.status === 'loading'" effect="plain">读取中</el-tag>
          <el-tag v-else effect="plain" type="danger">异常</el-tag>
          <div class="merge-row-actions">
            <el-button :icon="Top" circle size="small" aria-label="上移" :disabled="isTaskRunning || index === 0" @click="moveFile(index, -1)" />
            <el-button :icon="Bottom" circle size="small" aria-label="下移" :disabled="isTaskRunning || index === files.length - 1" @click="moveFile(index, 1)" />
            <el-button :icon="Delete" circle size="small" aria-label="删除" :disabled="isTaskRunning" @click="removeFile(index)" />
          </div>
        </article>
      </div>
    </section>
  </section>
</template>
