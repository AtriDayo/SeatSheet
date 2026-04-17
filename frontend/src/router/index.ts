import { createRouter, createWebHistory } from "vue-router";
import ConfigPage from "../pages/ConfigPage.vue";
import DisplayPage from "../pages/DisplayPage.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: DisplayPage },
    { path: "/config", component: ConfigPage }
  ]
});
