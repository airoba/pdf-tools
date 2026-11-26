<script setup lang="ts">
import { useTaskStore } from "@/stores/task";

const taskStore = useTaskStore();
const statusLabel = window.xiaoyejiang ? "本地处理就绪" : "浏览器预览模式";

function minimizeWindow() {
  void window.xiaoyejiang?.minimize();
}

function toggleMaximizeWindow() {
  void window.xiaoyejiang?.toggleMaximize();
}

function closeWindow() {
  void window.xiaoyejiang?.close();
}
</script>

<template>
  <div class="app-shell">
    <header class="topbar glass-panel">
      <RouterLink to="/" class="brand" aria-label="返回功能中心">
        <div class="brand-mark">P</div>
        <div>
          <strong>PDF处理工具</strong>
          <span>本地 PDF 工作台</span>
        </div>
      </RouterLink>

      <div class="top-actions">
        <button class="status-pill" type="button">
          <span class="status-dot" />
          {{ statusLabel }}
        </button>
        <div class="window-controls" aria-label="窗口控制">
          <button class="window-control" type="button" aria-label="最小化" @click.stop="minimizeWindow">−</button>
          <button class="window-control" type="button" aria-label="最大化" @click.stop="toggleMaximizeWindow">□</button>
          <button class="window-control close" type="button" aria-label="关闭" @click.stop="closeWindow">×</button>
        </div>
      </div>
    </header>

    <main class="main-area">
      <slot />
    </main>

    <footer class="statusbar glass-panel">
      <span>离线模式</span>
      <span>·</span>
      <span>{{ statusLabel }}</span>
      <span>·</span>
      <span>{{ taskStore.statusText }}</span>
    </footer>
  </div>
</template>
