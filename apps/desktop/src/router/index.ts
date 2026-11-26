import { createRouter, createWebHashHistory } from "vue-router";
import FeatureCenter from "@/views/FeatureCenter.vue";
import ExtractView from "@/views/ExtractView.vue";
import MergeView from "@/views/MergeView.vue";
import DeleteView from "@/views/DeleteView.vue";
import ImageExportView from "@/views/ImageExportView.vue";
import ImageToPdfView from "@/views/ImageToPdfView.vue";
import MixedMergeView from "@/views/MixedMergeView.vue";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", name: "feature-center", component: FeatureCenter },
    { path: "/extract", name: "extract", component: ExtractView },
    { path: "/merge", name: "merge", component: MergeView },
    { path: "/delete", name: "delete", component: DeleteView },
    { path: "/images", name: "images", component: ImageExportView },
    { path: "/image-to-pdf", name: "image-to-pdf", component: ImageToPdfView },
    { path: "/mixed-merge", name: "mixed-merge", component: MixedMergeView },
  ],
});

export default router;
