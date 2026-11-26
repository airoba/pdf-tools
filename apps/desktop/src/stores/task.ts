import { defineStore } from "pinia";

export const useTaskStore = defineStore("task", {
  state: () => ({
    selectedFile: "",
    isBusy: false,
    statusText: "未选择文件",
  }),
});
