<script setup lang="ts">
import { Moon, Sun } from "@lucide/vue";
import { onMounted, onUnmounted, ref } from "vue";

const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
const dark = ref(document.documentElement.dataset.theme === "dark");
function syncTheme() {
  let preference: string | null = null;
  try { preference = localStorage.getItem("seatsheet-theme"); } catch { /* Storage is optional. */ }
  dark.value = preference ? preference === "dark" : systemTheme.matches;
  document.documentElement.dataset.theme = dark.value ? "dark" : "light";
}
function toggleTheme() {
  dark.value = !dark.value;
  const theme = dark.value ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem("seatsheet-theme", theme); } catch { /* Keep the session preference. */ }
}
onMounted(() => {
  syncTheme();
  systemTheme.addEventListener("change", syncTheme);
});
onUnmounted(() => systemTheme.removeEventListener("change", syncTheme));
</script>

<template>
  <header class="site-bar">
    <div class="site-bar__inner">
      <RouterLink to="/" aria-label="SeatSheet 首页" class="brand">
        <span class="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
        <span>SEAT<b>SHEET</b></span>
      </RouterLink>
      <nav class="site-nav" aria-label="主导航">
        <RouterLink to="/">座位展示</RouterLink>
        <RouterLink to="/config">座位编辑</RouterLink>
        <RouterLink to="/rotate">轮换规则</RouterLink>
      </nav>
      <button type="button" class="theme-button" :aria-label="dark ? '切换浅色模式' : '切换深色模式'" :title="dark ? '切换浅色模式' : '切换深色模式'" @click="toggleTheme">
        <component :is="dark ? Sun : Moon" :size="17" aria-hidden="true" />
      </button>
    </div>
  </header>
</template>
