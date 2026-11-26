<script setup lang="ts">
import { ArrowLeft, ArrowRight, Check, ZoomIn, ZoomOut } from "@element-plus/icons-vue";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { computed, markRaw, nextTick, onBeforeUnmount, ref, shallowRef } from "vue";
import { useTaskStore } from "@/stores/task";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
// pdfjs 5.x 解码 JBIG2/CCITT 图像依赖 wasm，需显式指定 wasmUrl，否则相关图像内容会缺失
const pdfjsWasmUrl = import.meta.env.BASE_URL + "wasm/";

type PreviewMode = "thumbs" | "single";
type ImageFormat = "png" | "jpeg";
type PreviewPage = {
  pageNumber: number;
  imageUrl: string;
  status: "idle" | "rendering" | "ready" | "error";
  errorMessage?: string;
};

const taskStore = useTaskStore();
const fileInput = ref<HTMLInputElement | null>(null);
const fileName = ref("");
const pdfBytes = ref<ArrayBuffer | null>(null);
const pdfDocument = shallowRef<PDFDocumentProxy | null>(null);
const pages = ref<PreviewPage[]>([]);
const selectedPages = ref<number[]>([]);
const pageRange = ref("");
const rangeError = ref("");
const isLoading = ref(false);
const isExporting = ref(false);
const previewMode = ref<PreviewMode>("thumbs");
const currentBrowsePage = ref(1);
const browseImageUrl = ref("");
const browseLoading = ref(false);
const browseScale = ref(1.5);
const singlePageStage = ref<HTMLElement | null>(null);
const previewVisible = ref(false);
const previewLoading = ref(false);
const previewPageNumber = ref(0);
const previewImageUrl = ref("");
const pageGrid = ref<HTMLElement | null>(null);
const gridScrollTop = ref(0);
const gridWidth = ref(0);
const gridHeight = ref(0);
const imageFormat = ref<ImageFormat>("png");

const pageElements = new Map<number, HTMLElement>();
const thumbnailQueue = new Set<number>();
const thumbnailCacheOrder: number[] = [];
const visibleThumbnailPages = new Set<number>();
let observer: IntersectionObserver | null = null;
let gridResizeObserver: ResizeObserver | null = null;
let activeThumbnailRenders = 0;
let fileVersion = 0;

const maxConcurrentThumbnailRenders = 3;
const maxCachedThumbnails = 80;
const maxQueuedThumbnails = 120;
const thumbnailMinWidth = 132;
const thumbnailGap = 14;
const virtualOverscanRows = 3;
const thumbnailScale = 0.24;
const dialogScale = 1.35;
// 原尺寸：按 PDF 页面物理尺寸以 300 DPI 渲染，保证清晰度
const exportDpi = 300;
const exportScale = exportDpi / 72;
const exportMime = computed(() => (imageFormat.value === "png" ? "image/png" : "image/jpeg"));
const exportExt = computed(() => (imageFormat.value === "png" ? "png" : "jpg"));

const isTaskRunning = computed(() => isLoading.value || isExporting.value);
const totalPages = computed(() => pages.value.length);
const selectedCount = computed(() => selectedPages.value.length);
const canExport = computed(() => Boolean(pdfBytes.value && selectedPages.value.length && !rangeError.value && !isTaskRunning.value));
const gridColumns = computed(() => Math.max(1, Math.floor((gridWidth.value + thumbnailGap) / (thumbnailMinWidth + thumbnailGap))));
const gridColumnWidth = computed(() => {
  const columns = gridColumns.value;
  return Math.max(thumbnailMinWidth, (gridWidth.value - thumbnailGap * (columns - 1)) / columns);
});
const gridItemHeight = computed(() => Math.ceil(gridColumnWidth.value / 0.72 + 48));
const virtualTotalRows = computed(() => Math.ceil(totalPages.value / gridColumns.value));
const virtualTotalHeight = computed(() => virtualTotalRows.value * gridItemHeight.value);
const virtualThumbPages = computed(() => {
  const { startIndex, endIndex } = getVirtualRange(virtualOverscanRows);
  return pages.value.slice(startIndex, endIndex);
});

function chooseFile() {
  if (isTaskRunning.value) return;
  fileInput.value?.click();
}

function pageAlt(pageNumber: number, kind = "预览") {
  return "第 " + pageNumber + " 页" + kind;
}

function revokeImageUrl(url: string) {
  if (url.startsWith("blob:")) URL.revokeObjectURL(url);
}

function removeThumbnailCacheEntry(pageNumber: number) {
  const index = thumbnailCacheOrder.indexOf(pageNumber);
  if (index >= 0) thumbnailCacheOrder.splice(index, 1);
}

function releaseThumbnail(pageNumber: number) {
  const page = pages.value[pageNumber - 1];
  if (!page) return;
  if (page.imageUrl) revokeImageUrl(page.imageUrl);
  page.imageUrl = "";
  if (page.status === "ready") page.status = "idle";
  removeThumbnailCacheEntry(pageNumber);
}

function touchThumbnailCache(pageNumber: number) {
  removeThumbnailCacheEntry(pageNumber);
  thumbnailCacheOrder.push(pageNumber);

  while (thumbnailCacheOrder.length > maxCachedThumbnails) {
    const oldest = thumbnailCacheOrder.shift();
    if (!oldest) continue;
    releaseThumbnail(oldest);
  }
}

function releaseAllImages() {
  for (const page of pages.value) {
    if (page.imageUrl) revokeImageUrl(page.imageUrl);
    page.imageUrl = "";
    if (page.status === "ready") page.status = "idle";
  }
  thumbnailCacheOrder.length = 0;
  if (browseImageUrl.value) revokeImageUrl(browseImageUrl.value);
  if (previewImageUrl.value) revokeImageUrl(previewImageUrl.value);
  browseImageUrl.value = "";
  previewImageUrl.value = "";
}

function resetObserver() {
  observer?.disconnect();
  gridResizeObserver?.disconnect();
  observer = null;
  gridResizeObserver = null;
  pageElements.clear();
  thumbnailQueue.clear();
  visibleThumbnailPages.clear();
  activeThumbnailRenders = 0;
}

function createObserver() {
  thumbnailQueue.clear();
  visibleThumbnailPages.clear();
  activeThumbnailRenders = 0;
  updateGridMetrics();
  gridResizeObserver?.disconnect();
  if (pageGrid.value) {
    gridResizeObserver = new ResizeObserver(() => {
      updateGridMetrics();
      queueVirtualThumbnails();
    });
    gridResizeObserver.observe(pageGrid.value);
  }
  queueVirtualThumbnails();
}

function setPageElement(pageNumber: number, element: Element | null) {
  if (!(element instanceof HTMLElement)) {
    pageElements.delete(pageNumber);
    visibleThumbnailPages.delete(pageNumber);
    return;
  }
  pageElements.set(pageNumber, element);
}

function getVisibleAnchorPage() {
  if (visibleThumbnailPages.size) {
    return Math.min(...visibleThumbnailPages);
  }
  const { visibleStartIndex } = getVirtualRange(0);
  return visibleStartIndex + 1;
}

function getVirtualRange(overscanRows = 0) {
  const columns = gridColumns.value;
  const itemHeight = gridItemHeight.value;
  const total = totalPages.value;
  const visibleStartRow = Math.max(0, Math.floor(gridScrollTop.value / itemHeight));
  const visibleEndRow = Math.min(virtualTotalRows.value, Math.ceil((gridScrollTop.value + gridHeight.value) / itemHeight));
  const startRow = Math.max(0, visibleStartRow - overscanRows);
  const endRow = Math.min(virtualTotalRows.value, visibleEndRow + overscanRows);
  return {
    visibleStartIndex: Math.min(total, visibleStartRow * columns),
    visibleEndIndex: Math.min(total, visibleEndRow * columns),
    startIndex: Math.min(total, startRow * columns),
    endIndex: Math.min(total, endRow * columns),
  };
}

function updateGridMetrics() {
  if (!pageGrid.value) return;
  gridWidth.value = pageGrid.value.clientWidth;
  gridHeight.value = pageGrid.value.clientHeight;
  gridScrollTop.value = pageGrid.value.scrollTop;
}

function getThumbStyle(pageNumber: number) {
  const index = pageNumber - 1;
  const row = Math.floor(index / gridColumns.value);
  const column = index % gridColumns.value;
  return {
    width: gridColumnWidth.value + "px",
    transform: "translate3d(" + column * (gridColumnWidth.value + thumbnailGap) + "px, " + row * gridItemHeight.value + "px, 0)",
  };
}

function queueVirtualThumbnails() {
  if (!pages.value.length || previewMode.value !== "thumbs") return;
  const visible = getVirtualRange(0);
  const buffered = getVirtualRange(virtualOverscanRows);
  visibleThumbnailPages.clear();
  for (let index = visible.visibleStartIndex; index < visible.visibleEndIndex; index += 1) visibleThumbnailPages.add(index + 1);
  for (let index = buffered.startIndex; index < buffered.endIndex; index += 1) {
    const page = pages.value[index];
    if (page?.status === "idle") thumbnailQueue.add(index + 1);
  }
  pruneThumbnailQueue();
  void drainThumbnailQueue();
}

function onThumbnailScroll() {
  updateGridMetrics();
  queueVirtualThumbnails();
}

function sortQueuedThumbnails() {
  const anchor = getVisibleAnchorPage();
  return Array.from(thumbnailQueue).sort((a, b) => {
    const aVisible = visibleThumbnailPages.has(a) ? 0 : 1;
    const bVisible = visibleThumbnailPages.has(b) ? 0 : 1;
    if (aVisible !== bVisible) return aVisible - bVisible;
    return Math.abs(a - anchor) - Math.abs(b - anchor);
  });
}

function pruneThumbnailQueue() {
  const sorted = sortQueuedThumbnails();
  thumbnailQueue.clear();
  for (const pageNumber of sorted.slice(0, maxQueuedThumbnails)) thumbnailQueue.add(pageNumber);
}

function queueThumbnail(pageNumber: number) {
  const page = pages.value[pageNumber - 1];
  if (!page || page.status !== "idle") return;
  thumbnailQueue.add(pageNumber);
  pruneThumbnailQueue();
  void drainThumbnailQueue();
}

async function drainThumbnailQueue() {
  if (!pdfDocument.value) return;
  while (activeThumbnailRenders < maxConcurrentThumbnailRenders && thumbnailQueue.size) {
    const [pageNumber] = sortQueuedThumbnails();
    thumbnailQueue.delete(pageNumber);
    activeThumbnailRenders += 1;
    void renderThumbnail(pageNumber).finally(() => {
      activeThumbnailRenders -= 1;
      void drainThumbnailQueue();
    });
  }
}

async function renderPageArrayBuffer(pageNumber: number, scale: number, imageType = "image/png", quality?: number): Promise<ArrayBuffer> {
  const pdf = pdfDocument.value;
  if (!pdf) throw new Error("PDF 尚未载入");
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("无法创建页面画布");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error("页面图片生成失败"));
    }, imageType, quality);
  });
  canvas.width = 1;
  canvas.height = 1;
  return blob.arrayBuffer();
}

async function renderPageImage(pageNumber: number, scale: number, imageType = "image/png", quality?: number) {
  const bytes = await renderPageArrayBuffer(pageNumber, scale, imageType, quality);
  return URL.createObjectURL(new Blob([bytes], { type: imageType }));
}

async function renderThumbnail(pageNumber: number) {
  const page = pages.value[pageNumber - 1];
  if (!page || page.status !== "idle") return;
  if (visibleThumbnailPages.size && !visibleThumbnailPages.has(pageNumber)) {
    const anchor = getVisibleAnchorPage();
    if (Math.abs(pageNumber - anchor) > 12) return;
  }
  const renderVersion = fileVersion;
  page.status = "rendering";
  page.errorMessage = undefined;
  try {
    const imageUrl = await renderPageImage(pageNumber, thumbnailScale, "image/jpeg", 0.76);
    if (renderVersion !== fileVersion) {
      revokeImageUrl(imageUrl);
      return;
    }
    if (page.imageUrl) revokeImageUrl(page.imageUrl);
    page.imageUrl = imageUrl;
    page.status = "ready";
    touchThumbnailCache(pageNumber);
  } catch (error) {
    page.status = "error";
    page.errorMessage = error instanceof Error ? error.message : "预览失败";
    console.error("PDF thumbnail render failed", pageNumber, error);
  }
}

async function resetBrowseScroll() {
  await nextTick();
  if (!singlePageStage.value) return;
  singlePageStage.value.scrollTop = 0;
  singlePageStage.value.scrollLeft = 0;
}

async function renderBrowsePage(pageNumber: number) {
  if (!pdfDocument.value || !pages.value.length) return;
  browseLoading.value = true;
  currentBrowsePage.value = Math.min(Math.max(pageNumber, 1), pages.value.length);
  const renderVersion = fileVersion;
  try {
    const imageUrl = await renderPageImage(currentBrowsePage.value, browseScale.value);
    if (renderVersion !== fileVersion) {
      revokeImageUrl(imageUrl);
      return;
    }
    if (browseImageUrl.value) revokeImageUrl(browseImageUrl.value);
    browseImageUrl.value = imageUrl;
    await resetBrowseScroll();
    queueThumbnail(currentBrowsePage.value);
  } catch (error) {
    rangeError.value = error instanceof Error ? error.message : "页面预览失败";
    console.error("PDF page render failed", currentBrowsePage.value, error);
  } finally {
    browseLoading.value = false;
  }
}

async function onPreviewModeChange() {
  if (previewMode.value === "single" && pages.value.length && !browseImageUrl.value) {
    await renderBrowsePage(selectedPages.value[0] ?? 1);
  }
  if (previewMode.value === "thumbs") {
    await nextTick();
    createObserver();
    for (let pageNumber = 1; pageNumber <= Math.min(totalPages.value, 10); pageNumber += 1) queueThumbnail(pageNumber);
  }
}

function goBrowsePage(delta: number) {
  void renderBrowsePage(currentBrowsePage.value + delta);
}

function zoomBrowse(delta: number) {
  if (browseLoading.value || !pdfDocument.value) return;
  const nextScale = Math.min(2.5, Math.max(0.7, Number((browseScale.value + delta).toFixed(2))));
  if (nextScale === browseScale.value) return;
  browseScale.value = nextScale;
  void renderBrowsePage(currentBrowsePage.value);
}

function onBrowsePageInput(value: number | undefined) {
  if (!value) return;
  void renderBrowsePage(value);
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    rangeError.value = "请选择有效的 PDF 文件";
    return;
  }

  fileVersion += 1;
  const currentVersion = fileVersion;
  releaseAllImages();
  resetObserver();
  isLoading.value = true;
  rangeError.value = "";
  pages.value = [];
  selectedPages.value = [];
  pageRange.value = "";
  currentBrowsePage.value = 1;
  browseImageUrl.value = "";
  previewVisible.value = false;
  previewImageUrl.value = "";
  fileName.value = file.name;
  pdfDocument.value?.destroy();
  pdfDocument.value = null;
  taskStore.statusText = "正在解析：" + file.name;

  try {
    const bytes = await file.arrayBuffer();
    if (currentVersion !== fileVersion) return;
    pdfBytes.value = bytes.slice(0);
    const loadingTask = pdfjsLib.getDocument({ data: bytes.slice(0), wasmUrl: pdfjsWasmUrl });
    const pdf = await loadingTask.promise;
    if (currentVersion !== fileVersion) {
      await pdf.destroy();
      return;
    }

    pdfDocument.value = markRaw(pdf);
    pages.value = Array.from({ length: pdf.numPages }, (_, index) => ({
      pageNumber: index + 1,
      imageUrl: "",
      status: "idle",
    }));

    await nextTick();
    if (previewMode.value === "single") void renderBrowsePage(1);
    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 10); pageNumber += 1) queueThumbnail(pageNumber);
    taskStore.statusText = "已载入 " + pdf.numPages + " 页 PDF";
  } catch (error) {
    pdfBytes.value = null;
    fileName.value = "";
    pages.value = [];
    rangeError.value = error instanceof Error ? error.message : "PDF 解析失败，请重新选择文件";
    taskStore.statusText = "PDF 解析失败";
  } finally {
    isLoading.value = false;
    input.value = "";
    // isLoading 置 false 后 pageGrid 才真正渲染，此时再初始化虚拟网格，
    // 否则会因 gridWidth 为 0 而排成单列竖排，滚动后才恢复正常多列横排
    if (currentVersion === fileVersion) {
      await nextTick();
      if (previewMode.value === "thumbs") createObserver();
    }
  }
}

function parsePageRange(raw: string, maxPage: number): number[] {
  const normalized = raw.replace(/\s/g, "");
  if (!normalized) return [];

  const result: number[] = [];
  for (const part of normalized.split(",")) {
    if (!part) throw new Error("页码格式不完整");
    if (part.includes("-")) {
      const [startText, endText] = part.split("-");
      const start = Number(startText);
      const end = Number(endText);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < 1 || start > end) {
        throw new Error("页码范围格式错误");
      }
      for (let page = start; page <= end; page += 1) result.push(page);
    } else {
      const page = Number(part);
      if (!Number.isInteger(page) || page < 1) throw new Error("页码格式错误");
      result.push(page);
    }
  }

  const unique = Array.from(new Set(result));
  if (unique.some((page) => page > maxPage)) throw new Error("页码不能超过 " + maxPage);
  return unique;
}

function compressPages(values: number[]) {
  const sorted = Array.from(new Set(values)).sort((a, b) => a - b);
  if (!sorted.length) return "";
  const ranges: string[] = [];
  let start = sorted[0]; 
  let previous = sorted[0]; 

  for (let index = 1; index <= sorted.length; index += 1) {
    const current = sorted[index]; 
    if (current === previous + 1) { 
      previous = current; 
      continue;
    }
    ranges.push(start === previous ? String(start) : start + "-" + previous);
    start = current;
    previous = current;
  }

  return ranges.join(",");
}

function onRangeInput() {
  if (!pageRange.value.trim()) {
    rangeError.value = "";
    selectedPages.value = [];
    return;
  }

  try {
    selectedPages.value = parsePageRange(pageRange.value, totalPages.value);
    rangeError.value = "";
  } catch (error) {
    rangeError.value = error instanceof Error ? error.message : "页码格式错误";
  }
}

function togglePage(pageNumber: number) {
  if (isTaskRunning.value) return;
  const set = new Set(selectedPages.value);
  if (set.has(pageNumber)) set.delete(pageNumber);
  else set.add(pageNumber);
  selectedPages.value = Array.from(set).sort((a, b) => a - b);
  pageRange.value = compressPages(selectedPages.value);
  rangeError.value = "";
}

function isSelected(pageNumber: number) {
  return selectedPages.value.includes(pageNumber);
}

async function openPreview(pageNumber: number) {
  if (!pdfDocument.value) return;
  previewVisible.value = true;
  previewLoading.value = true;
  previewPageNumber.value = pageNumber;
  if (previewImageUrl.value) revokeImageUrl(previewImageUrl.value);
  previewImageUrl.value = "";
  const renderVersion = fileVersion;
  try {
    const imageUrl = await renderPageImage(pageNumber, dialogScale);
    if (renderVersion !== fileVersion) {
      revokeImageUrl(imageUrl);
      return;
    }
    previewImageUrl.value = imageUrl;
  } catch (error) {
    rangeError.value = error instanceof Error ? error.message : "页面预览失败";
    console.error("PDF dialog render failed", pageNumber, error);
  } finally {
    previewLoading.value = false;
  }
}

function sanitizeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|\s]+/g, "_").replace(/\.+$/g, "").trim() || "PDF页面";
}

async function exportPagesAsImages() {
  if (!pdfDocument.value || !canExport.value) return;
  const picker = window.xiaoyejiang?.saveDirectory;
  if (!picker) {
    rangeError.value = "当前环境不支持目录选择，请在桌面应用中使用";
    return;
  }

  isExporting.value = true;

  try {
    // 只选择一次目录，选中后自动把每张图片写入该目录
    taskStore.statusText = "请选择图片保存目录";
    const dirPath = await picker();
    if (!dirPath) {
      taskStore.statusText = "已取消导出";
      return;
    }

    const exportVersion = fileVersion;
    const baseName = sanitizeFileName(fileName.value.replace(/\.pdf$/i, ""));
    const selected = selectedPages.value;
    for (let index = 0; index < selected.length; index += 1) {
      if (exportVersion !== fileVersion) return;
      const pageNumber = selected[index];
      taskStore.statusText = "正在导出第 " + pageNumber + " 页...";
      const bytes = await renderPageArrayBuffer(
        pageNumber,
        exportScale,
        exportMime.value,
        imageFormat.value === "jpeg" ? 0.92 : undefined,
      );
      if (exportVersion !== fileVersion) return;
      const outputName = baseName + "-第" + pageNumber + "页-原尺寸." + exportExt.value;
      window.xiaoyejiang?.writeImage(dirPath, outputName, bytes);
    }
    taskStore.statusText = "已导出 " + selected.length + " 页原尺寸图片到所选目录";
  } catch (error) {
    rangeError.value = error instanceof Error ? error.message : "导出图片失败";
    taskStore.statusText = "导出图片失败";
  } finally {
    isExporting.value = false;
  }
}

onBeforeUnmount(() => {
  releaseAllImages();
  resetObserver();
  pdfDocument.value?.destroy();
});
</script>

<template>
  <input ref="fileInput" class="hidden-input" type="file" accept="application/pdf,.pdf" @change="onFileChange" />

  <section class="extract-page">
    <aside class="glass-panel extract-sidebar">
      <div>
        <h1>PDF 页面转图片</h1>
        <p>选择本地 PDF 后，可点击页面缩略图或输入页码范围来确定要导出图片的页面。</p>
      </div>

      <el-button class="extract-button" type="primary" :loading="isLoading" :disabled="isExporting" @click="chooseFile">
        {{ fileName ? "重新选择 PDF" : "选择 PDF" }}
      </el-button>

      <div class="file-summary" :class="{ empty: !fileName }">
        <strong>{{ fileName || "尚未选择文件" }}</strong>
        <span>{{ totalPages ? totalPages + " 页 · 已选 " + selectedCount + " 页" : "支持本地 PDF 文件" }}</span>
      </div>

      <div class="range-section">
        <label class="field-label" for="pageRange">页码范围</label>
        <el-input
          id="pageRange"
          v-model="pageRange"
          placeholder="例如 1-3,5,8"
          :disabled="!totalPages || isTaskRunning"
          clearable
          @input="onRangeInput"
        />
        <p class="hint">支持单页、连续页、不连续页。输入后会同步选中右侧页面。</p>
        <p v-if="rangeError" class="form-error">{{ rangeError }}</p>
      </div>

      <div class="range-section">
        <span class="field-label">图片格式</span>
        <el-radio-group v-model="imageFormat" :disabled="isTaskRunning">
          <el-radio-button label="png">PNG</el-radio-button>
          <el-radio-button label="jpeg">JPG</el-radio-button>
        </el-radio-group>
        <p class="hint">按 PDF 页面原尺寸（300 DPI）导出。选择一次保存目录，自动把每个选中页各存为一张图片。</p>
      </div>

      <el-button class="extract-action" type="primary" :loading="isExporting" :disabled="!canExport" @click="exportPagesAsImages">
        开始导出图片
      </el-button>
    </aside>

    <section class="glass-panel extract-preview">
      <div class="preview-heading">
        <div>
          <h2>页面预览</h2>
        </div>
        <div class="preview-tools">
          <el-radio-group v-model="previewMode" size="small" :disabled="isTaskRunning" @change="onPreviewModeChange">
            <el-radio-button label="thumbs">缩略图</el-radio-button>
            <el-radio-button label="single">按页浏览</el-radio-button>
          </el-radio-group>
        </div>
      </div>

      <div v-if="isLoading" class="preview-empty">正在解析 PDF 页面...</div>
      <div v-else-if="!pages.length" class="preview-empty">选择 PDF 后将在此显示每一页预览。</div>

      <div ref="pageGrid" v-else-if="previewMode === 'thumbs'" class="page-grid" @scroll="onThumbnailScroll">
        <div class="page-grid-spacer" :style="{ height: virtualTotalHeight + 'px' }">
          <article
            v-for="page in virtualThumbPages"
            :key="page.pageNumber"
            :ref="(el) => setPageElement(page.pageNumber, el as Element | null)"
            class="page-thumb"
            :class="{ selected: isSelected(page.pageNumber), loading: page.status !== 'ready' }"
            :data-page-number="page.pageNumber"
            :style="getThumbStyle(page.pageNumber)"
          >
            <button class="page-select-zone" type="button" :disabled="isTaskRunning" @click="togglePage(page.pageNumber)">
              <span v-if="isSelected(page.pageNumber)" class="page-selected-mark"><el-icon><Check /></el-icon></span>
              <img v-if="page.status === 'ready'" :src="page.imageUrl" :alt="pageAlt(page.pageNumber)" />
              <span v-else class="page-placeholder">
                {{ page.status === "error" ? page.errorMessage || "预览失败" : "加载中" }}
              </span>
              <span class="page-label">第 {{ page.pageNumber }} 页</span>
            </button>
            <el-button class="page-zoom" :icon="ZoomIn" circle size="small" aria-label="放大预览" :disabled="page.status === 'error'" @click="openPreview(page.pageNumber)" />
          </article>
        </div>
      </div>

      <div v-else class="single-page-browser">
        <div ref="singlePageStage" v-loading="browseLoading" class="single-page-stage" :class="{ selected: isSelected(currentBrowsePage) }">
          <div class="single-page-paper" :class="{ selected: isSelected(currentBrowsePage) }">
            <span v-if="isSelected(currentBrowsePage)" class="single-selected-mark"><el-icon><Check /></el-icon>已选中</span>
            <img v-if="browseImageUrl" :src="browseImageUrl" :alt="pageAlt(currentBrowsePage)" />
          </div>
        </div>
        <div class="single-toolbar">
          <el-button :icon="ArrowLeft" :disabled="currentBrowsePage <= 1 || browseLoading" @click="goBrowsePage(-1)">上一页</el-button>
          <el-input-number
            v-model="currentBrowsePage"
            :min="1"
            :max="totalPages"
            :disabled="browseLoading"
            controls-position="right"
            @change="onBrowsePageInput"
          />
          <span class="single-total">/ {{ totalPages }} 页</span>
          <el-button :icon="ArrowRight" :disabled="currentBrowsePage >= totalPages || browseLoading" @click="goBrowsePage(1)">下一页</el-button>
          <el-button :icon="ZoomOut" circle :disabled="browseLoading || browseScale <= 0.7" @click="zoomBrowse(-0.2)" />
          <span class="single-zoom-value">{{ Math.round(browseScale * 100) }}%</span>
          <el-button :icon="ZoomIn" circle :disabled="browseLoading || browseScale >= 2.5" @click="zoomBrowse(0.2)" />
          <el-button :type="isSelected(currentBrowsePage) ? 'primary' : 'default'" :disabled="browseLoading" @click="togglePage(currentBrowsePage)">
            {{ isSelected(currentBrowsePage) ? "取消选中" : "选中本页" }}
          </el-button>
        </div>
      </div>
    </section>
  </section>

  <el-dialog v-model="previewVisible" class="pdf-preview-dialog" :title="'第 ' + previewPageNumber + ' 页预览'" width="760px" align-center>
    <div v-loading="previewLoading" class="large-preview-body">
      <img v-if="previewImageUrl" :src="previewImageUrl" :alt="pageAlt(previewPageNumber, '放大预览')" />
    </div>
  </el-dialog>
</template>