<script setup lang="ts">
import { ref } from "vue";
import UploadPanel from "@/components/UploadPanel.vue";
import { useTaskStore } from "@/stores/task";

const taskStore = useTaskStore();
const selected = ref<string[]>([]);
const result = ref("");

function onSelected(paths: string[]) {
  selected.value = paths.slice(0, 1);
  taskStore.statusText = selected.value.length ? "已选择 1 个 PDF" : "未选择文件";
}
</script>

<template>
  <UploadPanel title="PDF OCR 识别" description="选择扫描版或图片型 PDF，本地识别文字并导出 Word。" @selected="onSelected" />

  <section class="tool-layout">
    <div class="glass-panel tool-panel">
      <p class="eyebrow">OCR TASK</p>
      <h2>识别控制</h2>
      <button class="primary-button" :disabled="!selected.length">开始 OCR 识别</button>
      <button class="secondary-button" :disabled="!result">导出 Word</button>
      <p class="hint">V2.0 提取纯文本内容，不还原复杂排版。</p>
    </div>

    <div class="glass-panel preview-panel text-preview">
      <p class="eyebrow">TEXT PREVIEW</p>
      <h2>识别结果</h2>
      <pre>{{ result || "识别完成后，文本将在这里展示。" }}</pre>
    </div>
  </section>
</template>
