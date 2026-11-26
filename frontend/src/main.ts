import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router";
import "./style.css";
import { initializeAppearance } from "./state/appearance";

initializeAppearance();
createApp(App).use(router).mount("#app");
