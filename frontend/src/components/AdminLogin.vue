<script setup lang="ts">
import { ArrowLeft, LockKeyhole } from "@lucide/vue";

defineProps<{
  section: string;
  busy: boolean;
  error: string;
}>();

const password = defineModel<string>("password", { required: true });
defineEmits<{ submit: [] }>();
</script>

<template>
  <main class="login-page">
    <div class="login-layout">
      <div class="login-intro">
        <span class="login-eyebrow">管理工作台</span>
        <h1>{{ section }}</h1>
        <p>输入管理密码，即可编辑班级座位或安排轮换。</p>
        <div class="login-plan" aria-hidden="true"><i v-for="n in 18" :key="n" /></div>
      </div>
      <form class="login-form" @submit.prevent="$emit('submit')">
        <RouterLink class="login-back" to="/"><ArrowLeft :size="15" />返回座位表</RouterLink>
        <div class="login-form__icon"><LockKeyhole :size="20" /></div>
        <h2>验证身份</h2>
        <label for="admin-password">管理密码</label>
        <input
          id="admin-password"
          v-model="password"
          type="password"
          autocomplete="off"
          placeholder="输入管理密码"
          required
          autofocus
        />
        <p v-if="error" class="workspace-error" role="alert">{{ error }}</p>
        <button type="submit" :disabled="busy">
          {{ busy ? "验证中…" : "进入工作台" }}
        </button>
      </form>
    </div>
  </main>
</template>
