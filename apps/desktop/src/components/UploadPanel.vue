<script setup lang="ts">
const props = defineProps<{
  title: string;
  description: string;
  multiple?: boolean;
}>();

const emit = defineEmits<{
  selected: [paths: string[]];
}>();

async function chooseFiles() {
  const paths = await window.xiaoyejiang?.openPdf(Boolean(props.multiple));
  emit("selected", paths ?? []);
}
</script>

<template>
  <section class="upload-panel glass-panel">
    <div>
      <p class="eyebrow">PDF IMPORT</p>
      <h1>{{ title }}</h1>
      <p>{{ description }}</p>
    </div>
    <button class="primary-button" type="button" @click="chooseFiles">选择 PDF</button>
  </section>
</template>
