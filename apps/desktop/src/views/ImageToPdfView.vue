<script setup lang="ts">
import { Delete, Download, Plus, Rank, ZoomIn } from "@element-plus/icons-vue";
import { PDFDocument } from "pdf-lib";
import { computed, ref, onBeforeUnmount } from "vue";
import { useTaskStore } from "@/stores/task";

type ImageItem = {
  id: string;
  file: File;
  name: string;
  size: number;
  width: number;
  height: number;
  imageUrl: string;
  status: "ready" | "loading" | "error";
  errorMessage?: string;
};

const taskStore = useTaskStore();
const fileInput = ref<HTMLInputElement | null>(null);
const items = ref<ImageItem[]>([]);
const isImporting = ref(false);
const isExporting = ref(false);
const errorText = ref("");
const draggingId = ref("");
const dragOverId = ref("");
const previewVisible = ref(false);
const previewImageUrl = ref("");
const previewImageName = ref("");

const readyItems = computed(() => items.value.filter((item) => item.status === "ready"));
const canExport = computed(() => readyItems.value.length > 0 && !isImporting.value && !isExporting.value);
const isTaskRunning = computed(() => isImporting.value || isExporting.value);

function fileId(file: File) {
  return [file.name, file.size, file.lastModified].join(":");
}

function formatSize(size: number) {
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + " KB";
  return (size / 1024 / 1024).toFixed(2) + " MB";
}

function isSupportedImage(file: File) {
  return file.type === "image/png" || file.type === "image/jpeg" || /\.(png|jpe?g)$/i.test(file.name);
}

function isPng(file: File) {
  return file.type === "image/png" || /\.png$/i.test(file.name);
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
  taskStore.statusText = "正在读取图片";

  try {
    const existingIds = new Set(items.value.map((item) => item.id));
    const candidates = selected.filter((file) => isSupportedImage(file) && !existingIds.has(fileId(file)));
    let skipped = selected.length - candidates.length;

    for (const file of candidates) {
      const item: ImageItem = {
        id: fileId(file),
        file,
        name: file.name,
        size: file.size,
        width: 0,
        height: 0,
        imageUrl: URL.createObjectURL(file),
        status: "loading",
      };
      items.value.push(item);

      try {
        const { width, height } = await readImageSize(file);
        item.width = width;
        item.height = height;
        item.status = "ready";
      } catch (error) {
        item.status = "error";
        item.errorMessage = error instanceof Error ? error.message : "图片读取失败";
      }
    }

    if (skipped > 0) {
      errorText.value = "已忽略 " + skipped + " 个重复或非 PNG/JPG 文件。";
    }
    taskStore.statusText = items.value.length ? "已导入 " + items.value.length + " 张图片" : "未选择图片";
  } finally {
    isImporting.value = false;
    input.value = "";
  }
}

function reorderImage(fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
  const next = [...items.value];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  items.value = next;
}

function onDragStart(event: DragEvent, item: ImageItem) {
  if (isTaskRunning.value) return;
  draggingId.value = item.id;
  event.dataTransfer?.setData("text/plain", item.id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

function onDragOver(event: DragEvent, item: ImageItem) {
  if (isTaskRunning.value || !draggingId.value || draggingId.value === item.id) return;
  event.preventDefault();
  dragOverId.value = item.id;
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
}

function onDrop(event: DragEvent, item: ImageItem) {
  if (isTaskRunning.value) return;
  event.preventDefault();
  const sourceId = event.dataTransfer?.getData("text/plain") || draggingId.value;
  const fromIndex = items.value.findIndex((image) => image.id === sourceId);
  const toIndex = items.value.findIndex((image) => image.id === item.id);
  reorderImage(fromIndex, toIndex);
  draggingId.value = "";
  dragOverId.value = "";
}

function onDragEnd() {
  draggingId.value = "";
  dragOverId.value = "";
}

function removeItem(index: number) {
  if (isTaskRunning.value) return;
  const item = items.value[index];
  if (item?.imageUrl) URL.revokeObjectURL(item.imageUrl);
  items.value.splice(index, 1);
  taskStore.statusText = items.value.length ? "已导入 " + items.value.length + " 张图片" : "未选择图片";
}

function clearItems() {
  if (isTaskRunning.value) return;
  for (const item of items.value) if (item.imageUrl) URL.revokeObjectURL(item.imageUrl);
  items.value = [];
  errorText.value = "";
  taskStore.statusText = "未选择图片";
}

function openPreview(item: ImageItem) {
  previewImageUrl.value = item.imageUrl;
  previewImageName.value = item.name;
  previewVisible.value = true;
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

function sanitizeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|\s]+/g, "_").replace(/\.+$/g, "").trim() || "图片转PDF";
}

async function exportPdf() {
  if (!canExport.value) return;
  isExporting.value = true;
  errorText.value = "";
  taskStore.statusText = "正在生成 PDF";

  try {
    const doc = await PDFDocument.create();
    for (const item of readyItems.value) {
      const bytes = await item.file.arrayBuffer();
      let image;
      if (isPng(item.file)) {
        image = await doc.embedPng(bytes);
      } else {
        image = await doc.embedJpg(bytes);
      }
      // 以图片原始像素尺寸作为页面尺寸（1px = 1pt），保持原始清晰度
      const page = doc.addPage([image.width, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    }

    const output = await doc.save();
    const blob = new Blob([new Uint8Array(output)], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = sanitizeFileName("图片转PDF-" + buildTimestamp()) + ".pdf";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 3000);
    taskStore.statusText = "已生成 PDF，共 " + readyItems.value.length + " 页";
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : "生成 PDF 失败";
    taskStore.statusText = "生成 PDF 失败";
  } finally {
    isExporting.value = false;
  }
}

onBeforeUnmount(() => {
  for (const item of items.value) if (item.imageUrl) URL.revokeObjectURL(item.imageUrl);
});
</script>

<template>
  <input ref="fileInput" class="hidden-input" type="file" accept="image/png,image/jpeg" multiple @change="onFileChange" />

  <section class="extract-page">
    <aside class="glass-panel extract-sidebar">
      <div>
        <h1>图片转 PDF</h1>
        <p>批量选择本地 PNG / JPG 图片，按顺序合成一份 PDF，每一张图片对应一页。</p>
      </div>

      <el-button class="extract-button" type="primary" :icon="Plus" :loading="isImporting" :disabled="isExporting" @click="chooseFiles">
        添加图片
      </el-button>

      <div class="file-summary" :class="{ empty: !items.length }">
        <strong>{{ items.length ? items.length + " 张图片" : "尚未选择图片" }}</strong>
        <span>{{ items.length ? readyItems.length + " 张可用 · 共 " + items.length + " 页" : "支持 PNG、JPG，可多选" }}</span>
      </div>

      <div class="range-section">
        <span class="field-label">合成规则</span>
        <p class="hint">列表顺序即 PDF 页码顺序，可拖拽缩略图调整；每张图片按原始尺寸生成一页。</p>
      </div>

      <p v-if="errorText" class="form-error">{{ errorText }}</p>

      <el-button class="extract-action" type="primary" :icon="Download" :loading="isExporting" :disabled="!canExport" @click="exportPdf">
        生成 PDF
      </el-button>
    </aside>

    <section class="glass-panel extract-preview">
      <div class="preview-heading">
        <div>
          <h2>图片预览</h2>
        </div>
        <div class="preview-tools">
          <el-button :icon="Plus" :loading="isImporting" :disabled="isTaskRunning || !items.length" @click="chooseFiles">继续添加</el-button>
          <el-button :disabled="isTaskRunning || !items.length" @click="clearItems">清空</el-button>
        </div>
      </div>

      <div v-if="isImporting && !items.length" class="preview-empty">正在读取图片...</div>
      <div v-else-if="!items.length" class="preview-empty">
        <span>点击左侧“添加图片”多选本地图片，将在此显示预览。</span>
      </div>

      <div v-else class="image-grid">
        <article
          v-for="(item, index) in items"
          :key="item.id"
          class="image-card"
          :class="[item.status, { dragging: draggingId === item.id, 'drag-over': dragOverId === item.id }]"
          :draggable="!isTaskRunning"
          @dragstart="onDragStart($event, item)"
          @dragover="onDragOver($event, item)"
          @dragleave="dragOverId = ''"
          @drop="onDrop($event, item)"
          @dragend="onDragEnd"
        >
          <div class="image-drag-handle" title="拖拽调整顺序"><el-icon><Rank /></el-icon></div>
          <span class="image-index">{{ index + 1 }}</span>
          <div class="image-card-body" @click="openPreview(item)">
            <img v-if="item.imageUrl" :src="item.imageUrl" :alt="item.name" />
            <span v-else class="image-placeholder">{{ item.status === "error" ? "不可用" : "加载中" }}</span>
          </div>
          <div class="image-card-meta">
            <strong :title="item.name">{{ item.name }}</strong>
            <span v-if="item.status === 'ready'">{{ item.width }} × {{ item.height }} · {{ formatSize(item.size) }}</span>
            <span v-else-if="item.status === 'loading'">读取中...</span>
            <span v-else>{{ item.errorMessage || "图片不可用" }}</span>
          </div>
          <div class="image-card-actions">
            <el-button :icon="ZoomIn" circle size="small" aria-label="放大预览" :disabled="item.status !== 'ready'" @click="openPreview(item)" />
            <el-button :icon="Delete" circle size="small" aria-label="删除" :disabled="isTaskRunning" @click="removeItem(index)" />
          </div>
        </article>
      </div>
    </section>
  </section>

  <el-dialog v-model="previewVisible" class="pdf-preview-dialog" :title="previewImageName" width="760px" align-center>
    <div class="large-preview-body">
      <img v-if="previewImageUrl" :src="previewImageUrl" :alt="previewImageName" />
    </div>
  </el-dialog>
</template>