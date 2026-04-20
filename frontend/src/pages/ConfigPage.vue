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
const draggedSeatKey = ref<string | null>(null);
const dragOverSeatKey = ref<string | null>(null);

const form = reactive<EditableSeatPlan>({
  name: "座位表",
  rows: 5,
  columns: 6,
  doorSide: "right",
  seats: []
});

const sortedSeats = computed(() =>
  [...form.seats].sort((a, b) => a.row - b.row || a.column - b.column)
);

function seatKey(seat: Pick<Seat, "row" | "column">) {
  return `${seat.row}:${seat.column}`;
}

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
    form.doorSide = plan.doorSide;
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
  clearSeatDrag();
  message.value = "";
  error.value = "";
}

function clearSeatDrag() {
  draggedSeatKey.value = null;
  dragOverSeatKey.value = null;
}

function findSeatByKey(key: string | null) {
  if (!key) {
    return undefined;
  }

  return form.seats.find((seat) => seatKey(seat) === key);
}

function startSeatDrag(seat: Seat, event: DragEvent) {
  draggedSeatKey.value = seatKey(seat);
  dragOverSeatKey.value = null;
  event.dataTransfer?.setData("text/plain", draggedSeatKey.value);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
  }
}

function setSeatDragTarget(seat: Seat) {
  const key = seatKey(seat);

  dragOverSeatKey.value = draggedSeatKey.value && draggedSeatKey.value !== key ? key : null;
}

function swapDraggedSeat(targetSeat: Seat) {
  const sourceSeat = findSeatByKey(draggedSeatKey.value);

  if (!sourceSeat || sourceSeat === targetSeat) {
    clearSeatDrag();
    return;
  }

  const sourceName = sourceSeat.name;
  const sourceStudentNo = sourceSeat.studentNo;
  sourceSeat.name = targetSeat.name;
  sourceSeat.studentNo = targetSeat.studentNo;
  targetSeat.name = sourceName;
  targetSeat.studentNo = sourceStudentNo;
  clearSeatDrag();
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
      doorSide: form.doorSide,
      seats: form.seats
    }, adminPassword.value);
    form.name = plan.name;
    form.rows = plan.rows;
    form.columns = plan.columns;
    form.doorSide = plan.doorSide;
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
  <main
    v-if="!authenticated"
    class="min-h-screen bg-stone-950 px-5 py-8 text-white"
  >
    <section class="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col justify-between">
      <div class="flex items-center justify-between">
        <p class="text-sm text-stone-400">SeatSheet Config</p>
        <RouterLink
          to="/"
          class="rounded-lg border border-stone-700 px-3 py-2 text-sm text-stone-300 transition hover:border-white hover:text-white"
        >
          返回展示页
        </RouterLink>
      </div>

      <form class="grid gap-10 md:grid-cols-[1fr_minmax(18rem,26rem)] md:items-end" @submit.prevent="authenticate">
        <div>
          <p class="mb-4 text-sm text-stone-400">管理入口</p>
          <h1 class="max-w-3xl text-4xl font-semibold tracking-normal sm:text-5xl">
            输入管理密码后才能修改座位表。
          </h1>
          <p class="mt-5 max-w-2xl text-base leading-7 text-stone-400">
            密码只会在当前页面内存中使用，不写入 Cookie 或浏览器存储。刷新页面、重新打开页面或退出管理后都需要再次输入。
          </p>
        </div>

        <div>
          <label class="block">
            <span class="mb-3 block text-sm text-stone-400">管理密码</span>
            <input
              v-model="adminPassword"
              type="password"
              autocomplete="off"
              class="w-full border-0 border-b border-stone-600 bg-transparent px-0 py-3 text-lg text-white outline-none transition placeholder:text-stone-600 focus:border-white"
              placeholder="输入密码"
              required
            />
          </label>
          <button
            class="mt-6 w-full rounded-lg bg-white px-4 py-3 text-stone-950 transition hover:bg-stone-200 disabled:cursor-not-allowed disabled:bg-stone-600 disabled:text-stone-300"
            type="submit"
            :disabled="authenticating"
          >
            {{ authenticating ? "验证中" : "进入管理" }}
          </button>
          <p v-if="error" class="mt-3 text-sm text-red-300">{{ error }}</p>
        </div>
      </form>

      <p class="text-sm text-stone-500">SeatSheet 不会在本机保存管理凭据。</p>
    </section>
  </main>

  <main v-else class="min-h-screen bg-stone-100 px-5 py-6 text-stone-950">
    <section class="mx-auto max-w-6xl">
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

      <div v-if="loading" class="rounded-lg border border-stone-200 bg-white p-5 text-stone-500">
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

        <div class="grid gap-4 md:grid-cols-5">
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
          <label class="block">
            <span class="mb-2 block text-sm text-stone-500">门的位置</span>
            <select
              v-model="form.doorSide"
              class="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 outline-none transition focus:border-stone-950"
            >
              <option value="left">左侧</option>
              <option value="right">右侧</option>
            </select>
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
        <p class="text-sm text-stone-500">拖动座位标题，可直接对调两人的位置。</p>

        <div class="flex items-stretch gap-3 pb-2">
          <div
            v-if="form.doorSide === 'left'"
            class="flex w-16 shrink-0 flex-col justify-between gap-3 py-1"
          >
            <div class="rounded-lg border border-stone-300 bg-stone-950 px-2 py-3 text-center text-sm font-medium text-white shadow-sm">
              前门
            </div>
            <div class="min-h-8 flex-1 border-l border-dashed border-stone-300" />
            <div class="rounded-lg border border-stone-300 bg-white px-2 py-3 text-center text-sm font-medium text-stone-800 shadow-sm">
              后门
            </div>
          </div>

          <div
            class="grid min-w-0 flex-1 gap-2"
            :style="{ gridTemplateColumns: `repeat(${form.columns}, minmax(0, 1fr))` }"
          >
            <div
              v-for="seat in sortedSeats"
              :key="seatKey(seat)"
              class="min-w-0 rounded-lg border p-2 shadow-sm transition"
              :class="{
                'border-stone-950 bg-amber-50 shadow-lg ring-2 ring-stone-950 ring-offset-2 ring-offset-stone-100 scale-[1.02]': dragOverSeatKey === seatKey(seat),
                'border-stone-400 bg-white opacity-70': draggedSeatKey === seatKey(seat),
                'border-stone-200 bg-white': draggedSeatKey !== seatKey(seat) && dragOverSeatKey !== seatKey(seat)
              }"
              @dragenter.prevent="setSeatDragTarget(seat)"
              @dragover.prevent="setSeatDragTarget(seat)"
              @drop.prevent="swapDraggedSeat(seat)"
            >
              <div
                class="mb-2 truncate rounded-md px-1 py-1 text-xs text-stone-500 transition hover:bg-stone-100"
                :class="draggedSeatKey === seatKey(seat) ? 'cursor-grabbing' : 'cursor-grab'"
                draggable="true"
                title="拖动以交换座位"
                @dragstart="startSeatDrag(seat, $event)"
                @dragend="clearSeatDrag"
              >
                第 {{ seat.row + 1 }} 排 / 第 {{ seat.column + 1 }} 列
              </div>
              <input
                v-model="seat.name"
                placeholder="姓名"
                class="mb-2 w-full rounded-lg border border-stone-300 px-2 py-1.5 outline-none transition focus:border-stone-950"
              />
              <input
                v-model="seat.studentNo"
                placeholder="学号"
                class="w-full rounded-lg border border-stone-300 px-2 py-1.5 outline-none transition focus:border-stone-950"
              />
            </div>
          </div>

          <div
            v-if="form.doorSide === 'right'"
            class="flex w-16 shrink-0 flex-col justify-between gap-3 py-1"
          >
            <div class="rounded-lg border border-stone-300 bg-stone-950 px-2 py-3 text-center text-sm font-medium text-white shadow-sm">
              前门
            </div>
            <div class="min-h-8 flex-1 border-l border-dashed border-stone-300" />
            <div class="rounded-lg border border-stone-300 bg-white px-2 py-3 text-center text-sm font-medium text-stone-800 shadow-sm">
              后门
            </div>
          </div>
        </div>
      </form>
    </section>
  </main>
</template>
