<script setup lang="ts">
import type { Component } from "vue";

defineProps<{
  icon: Component;
  title: string;
  description: string;
  meta: string[];
  action: string;
  to: string;
}>();
</script>

<template>
  <article class="feature-card glass-panel">
    <div class="feature-icon"><el-icon><component :is="icon" /></el-icon></div>
    <div class="feature-copy">
      <h2>{{ title }}</h2>
      <p>{{ description }}</p>
    </div>
    <div class="feature-meta">
      <span v-for="item in meta" :key="item">{{ item }}</span>
    </div>
    <RouterLink :to="to" class="primary-button">{{ action }}</RouterLink>
  </article>
</template>
