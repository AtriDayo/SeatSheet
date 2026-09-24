<script setup lang="ts">
import { ArrowLeft, LogOut } from "@lucide/vue";

defineProps<{
  name: string;
  dirty: boolean;
}>();

defineEmits<{ logout: [] }>();
</script>

<template>
  <header class="admin-header">
    <div class="admin-header__brand">
      <div class="admin-header__identity">
        <strong>SeatSheet</strong>
        <span>{{ name || "座位表" }}</span>
      </div>
    </div>

    <div class="admin-header__actions">
      <span v-if="dirty" class="admin-dirty"
        ><span aria-hidden="true" />未保存</span
      >
      <RouterLink
        class="admin-header__icon"
        to="/"
        title="返回展示页"
        aria-label="返回展示页"
      >
        <ArrowLeft :size="18" aria-hidden="true" />
      </RouterLink>
      <button
        class="admin-header__icon"
        type="button"
        title="退出管理"
        aria-label="退出管理"
        @click="$emit('logout')"
      >
        <LogOut :size="18" aria-hidden="true" />
      </button>
    </div>
  </header>
</template>
