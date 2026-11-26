<script setup lang="ts">
import { appearance } from "../state/appearance";
</script>

<template>
  <section class="workspace-section">
    <h2><label for="interface-theme">界面主题</label></h2>
    <select id="interface-theme" v-model="appearance" class="workspace-input" aria-describedby="theme-scope">
      <option value="classic">经典（默认）</option>
      <option value="endfield">终末地</option>
    </select>
    <p id="theme-scope">仅对当前浏览器生效。</p>
  </section>
</template>

<style scoped>
p { margin-top: 6px; color: var(--muted); font-size: 12px; }
</style>
