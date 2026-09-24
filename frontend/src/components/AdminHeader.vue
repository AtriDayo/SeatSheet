<script setup lang="ts">
import { ArrowLeft, LayoutGrid, LogOut, Repeat2 } from "@lucide/vue";

defineProps<{
  active: "config" | "rotate";
  name: string;
  dirty: boolean;
}>();

defineEmits<{ logout: [] }>();
</script>

<template>
  <header class="admin-header">
    <div class="admin-header__brand">
      <span class="admin-header__mark" aria-hidden="true">S</span>
      <div class="admin-header__identity">
        <strong>SeatSheet</strong>
        <span>{{ name || "座位表" }}</span>
      </div>
    </div>

    <nav class="admin-header__nav" aria-label="管理页面">
      <RouterLink to="/config" :class="{ 'is-active': active === 'config' }">
        <LayoutGrid :size="17" aria-hidden="true" />
        座位编辑
      </RouterLink>
      <RouterLink to="/rotate" :class="{ 'is-active': active === 'rotate' }">
        <Repeat2 :size="17" aria-hidden="true" />
        轮换规则
      </RouterLink>
    </nav>

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
