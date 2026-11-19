<script setup lang="ts">
import { Eye, LogOut } from "@lucide/vue";

defineProps<{
  name: string;
  dirty: boolean;
}>();

defineEmits<{ logout: [] }>();
</script>

<template>
  <header class="workspace-title">
    <div class="workspace-identity">
      <h1 class="header-class">{{ name || "座位管理" }}</h1>
      <slot name="summary" />
    </div>
    <nav class="workspace-nav" aria-label="管理导航">
      <RouterLink to="/config">座位编辑</RouterLink>
      <RouterLink to="/rotate">轮换规则</RouterLink>
    </nav>
    <div class="admin-header__actions">
      <slot />
      <span v-if="dirty" class="admin-dirty"
        ><span aria-hidden="true" />未保存</span
      >
      <RouterLink
        class="admin-header__icon"
        to="/"
        title="返回展示页"
        aria-label="返回展示页"
      >
        <Eye :size="16" aria-hidden="true" /><span>展示页</span>
      </RouterLink>
      <button
        class="admin-header__icon"
        type="button"
        title="退出管理"
        aria-label="退出管理"
        @click="$emit('logout')"
      >
        <LogOut :size="16" aria-hidden="true" /><span>退出</span>
      </button>
    </div>
  </header>
</template>
