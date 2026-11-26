<script setup lang="ts">
import { Crop, Delete, Files, Picture, PictureFilled, CopyDocument } from "@element-plus/icons-vue";
import FeatureCard from "@/components/FeatureCard.vue";

const features = [
  {
    icon: Crop,
    title: "PDF 截取",
    description: "从单个 PDF 精准提取指定页，保留原始排版与清晰度。",
    meta: ["单文件", "页码范围", "缩略图选择"],
    action: "开始截取",
    to: "/extract",
  },
  {
    icon: Picture,
    title: "PDF 转图片",
    description: "把指定 PDF 页面按原尺寸导出为高清图片，PNG / JPG 可选。",
    meta: ["单文件", "页码范围", "原尺寸导出"],
    action: "开始导出",
    to: "/images",
  },
  {
    icon: PictureFilled,
    title: "图片转 PDF",
    description: "批量选择本地 PNG / JPG 图片，按顺序合成为一份多页 PDF 文件。",
    meta: ["多图片", "顺序调整", "本地合成"],
    action: "开始合成",
    to: "/image-to-pdf",
  },
  {
    icon: Delete,
    title: "PDF 删除页面",
    description: "从单个 PDF 中移除指定页，并保留剩余页面输出为新文件。",
    meta: ["单文件", "删除页码", "预览选择"],
    action: "开始删除",
    to: "/delete",
  },
  {
    icon: Files,
    title: "PDF 合并",
    description: "按自定义顺序合并多份 PDF，自动规避重复导入。",
    meta: ["多文件", "顺序调整", "本地导出"],
    action: "开始合并",
    to: "/merge",
  },
  {
    icon: CopyDocument,
    title: "混合合并",
    description: "图片与 PDF 一起拖入，按顺序合成为一份新的 PDF 文件。",
    meta: ["图片 + PDF", "顺序调整", "本地导出"],
    action: "开始合并",
    to: "/mixed-merge",
  },
];
</script>

<template>
  <section class="workbench-hero">
    <p class="eyebrow">LOCAL PDF WORKBENCH</p>
    <h1>今天要处理哪类 PDF？</h1>
    <p>所有文件仅在本机处理，离线且安全。</p>
  </section>

  <section class="feature-grid" aria-label="PDF 核心功能">
    <FeatureCard v-for="feature in features" :key="feature.title" v-bind="feature" />
  </section>

  <section class="status-strip glass-panel">
    <div><strong>本地处理已就绪</strong><span>文件无需上传</span></div>
    <div><strong>五项常用功能</strong><span>选择所需操作即可开始</span></div>
    <div><strong>默认保存：下载文件夹</strong><span>导出时可临时修改</span></div>
  </section>

  <section class="recent-panel glass-panel">
    <div>
      <p class="eyebrow">CURRENT SESSION</p>
      <h2>最近处理</h2>
    </div>
    <p>暂无最近任务，导入 PDF 后将在此显示当前会话状态。</p>
  </section>
</template>
