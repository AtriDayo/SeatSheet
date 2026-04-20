<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { fetchSeatPlan, saveSeatPlan, verifyAdminPassword } from "../api/seatPlan";
import type { EditableSeatPlan, Seat } from "../types/seat";

const loading = ref(true);
const saving = ref(false);
const authenticating = ref(false);
const authenticated = ref(false);
const adminPassword = ref("");
const message = ref("");
const error = ref("");

const form = reactive<EditableSeatPlan>({
  name: "座位表",
  rows: 5,
  columns: 6,
  seats: []
});

const sortedSeats = computed(() =>
  [...form.seats].sort((a, b) => a.row - b.row || a.column - b.column)
);

function createEmptySeat(row: number, column: number): Seat {
  return { row, column, name: null, studentNo: null };
}

function normalizeSeats() {
  const seatByKey = new Map(form.seats.map((seat) => [`${seat.row}:${seat.column}`, seat]));
  const normalized: Seat[] = [];

  for (let row = 0; row < form.rows; row += 1) {
    for (let column = 0; column < form.columns; column += 1) {
      normalized.push(seatByKey.get(`${row}:${column}`) ?? createEmptySeat(row, column));
    }
  }

  form.seats = normalized;
}

async function loadPlan() {
  loading.value = true;
  error.value = "";

  try {
    const plan = await fetchSeatPlan();
    form.name = plan.name;
    form.rows = plan.rows;
    form.columns = plan.columns;
    form.seats = plan.seats.map((seat) => ({
      row: seat.row,
      column: seat.column,
      name: seat.name,
      studentNo: seat.studentNo
    }));
    normalizeSeats();
  } catch (err) {
    error.value = err instanceof Error ? err.message : "加载失败";
  } finally {
    loading.value = false;
  }
}

async function authenticate() {
  authenticating.value = true;
  error.value = "";

  try {
    await verifyAdminPassword(adminPassword.value);
    authenticated.value = true;
    await loadPlan();
  } catch (err) {
    adminPassword.value = "";
    error.value = err instanceof Error ? err.message : "管理密码错误";
  } finally {
    authenticating.value = false;
  }
}

function leaveAdmin() {
  authenticated.value = false;
  adminPassword.value = "";
  form.seats = [];
  message.value = "";
  error.value = "";
}

async function submit() {
  saving.value = true;
  error.value = "";
  message.value = "";

  try {
    const plan = await saveSeatPlan({
      name: form.name,
      rows: Number(form.rows),
      columns: Number(form.columns),
      seats: form.seats
    }, adminPassword.value);
    form.name = plan.name;
    form.rows = plan.rows;
    form.columns = plan.columns;
    form.seats = plan.seats;
    message.value = "已保存";
  } catch (err) {
    error.value = err instanceof Error ? err.message : "保存失败";
  } finally {
    saving.value = false;
  }
}

watch(
  () => [form.rows, form.columns],
  () => normalizeSeats()
);

onMounted(() => {
  loading.value = false;
});
</script>

<template>
  <main class="min-h-screen bg-stone-100 px-5 py-8 text-stone-950">
    <section class="mx-auto max-w-7xl">
      <div class="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="text-sm text-stone-500">SeatSheet Config</p>
          <h1 class="text-3xl font-semibold tracking-normal">座位表设置</h1>
        </div>
        <RouterLink
          to="/"
          class="w-fit rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-700 transition hover:border-stone-950 hover:text-stone-950"
        >
          返回展示页
        </RouterLink>
      </div>

      <form
        v-if="!authenticated"
        class="max-w-md rounded-lg border border-stone-200 bg-white p-5 shadow-sm"
        @submit.prevent="authenticate"
      >
        <h2 class="text-xl font-semibold">进入管理页</h2>
        <p class="mt-2 text-sm text-stone-500">请输入管理密码。本页面不会保存密码，刷新或重新进入后需要再次输入。</p>
        <label class="mt-5 block">
          <span class="mb-2 block text-sm text-stone-500">管理密码</span>
          <input
            v-model="adminPassword"
            type="password"
            autocomplete="off"
            class="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 outline-none transition focus:border-stone-950"
            required
          />
        </label>
        <button
          class="mt-4 w-full rounded-lg bg-stone-950 px-4 py-2 text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
          type="submit"
          :disabled="authenticating"
        >
          {{ authenticating ? "验证中" : "进入" }}
        </button>
        <p v-if="error" class="mt-3 text-sm text-red-700">{{ error }}</p>
      </form>

      <div v-else-if="loading" class="rounded-lg border border-stone-200 bg-white p-5 text-stone-500">
        正在加载设置
      </div>

      <form v-else class="space-y-6" @submit.prevent="submit">
        <div class="flex justify-end">
          <button
            class="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-700 transition hover:border-stone-950 hover:text-stone-950"
            type="button"
            @click="leaveAdmin"
          >
            退出管理
          </button>
        </div>

        <div class="grid gap-4 md:grid-cols-4">
          <label class="block">
            <span class="mb-2 block text-sm text-stone-500">名称</span>
            <input
              v-model="form.name"
              class="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 outline-none transition focus:border-stone-950"
              maxlength="80"
              required
            />
          </label>
          <label class="block">
            <span class="mb-2 block text-sm text-stone-500">纵向座位数</span>
            <input
              v-model.number="form.rows"
              type="number"
              min="1"
              max="30"
              class="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 outline-none transition focus:border-stone-950"
            />
          </label>
          <label class="block">
            <span class="mb-2 block text-sm text-stone-500">横向座位数</span>
            <input
              v-model.number="form.columns"
              type="number"
              min="1"
              max="30"
              class="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 outline-none transition focus:border-stone-950"
            />
          </label>
          <div class="flex items-end">
            <button
              class="w-full rounded-lg bg-stone-950 px-4 py-2 text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
              type="submit"
              :disabled="saving"
            >
              {{ saving ? "保存中" : "保存" }}
            </button>
          </div>
        </div>

        <p v-if="message" class="text-sm text-emerald-700">{{ message }}</p>
        <p v-if="error" class="text-sm text-red-700">{{ error }}</p>

        <div
          class="grid gap-3 overflow-x-auto pb-2"
          :style="{ gridTemplateColumns: `repeat(${form.columns}, minmax(12rem, 1fr))` }"
        >
          <div
            v-for="seat in sortedSeats"
            :key="`${seat.row}:${seat.column}`"
            class="rounded-lg border border-stone-200 bg-white p-3 shadow-sm"
          >
            <div class="mb-3 text-xs text-stone-500">
              第 {{ seat.row + 1 }} 排 / 第 {{ seat.column + 1 }} 列
            </div>
            <input
              v-model="seat.name"
              placeholder="姓名"
              class="mb-2 w-full rounded-lg border border-stone-300 px-3 py-2 outline-none transition focus:border-stone-950"
            />
            <input
              v-model="seat.studentNo"
              placeholder="学号"
              class="w-full rounded-lg border border-stone-300 px-3 py-2 outline-none transition focus:border-stone-950"
            />
          </div>
        </div>
      </form>
    </section>
  </main>
</template>
