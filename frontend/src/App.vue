<script setup lang="ts">
import { isEndfield } from "./state/appearance";
import SiteBar from "./components/SiteBar.vue";
</script>

<template>
  <SiteBar v-if="isEndfield" />
  <RouterView />
</template>
