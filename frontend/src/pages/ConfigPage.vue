<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { fetchSeatPlan, saveSeatPlan, verifyAdminPassword } from "../api/seatPlan";
import type { EditableSeatPlan, Seat } from "../types/seat";
import { useAdminSession } from "../state/adminSession";

const loading = ref(true);
const saving = ref(false);
const authenticating = ref(false);
const loginPassword = ref("");
const message = ref("");
const error = ref("");
const importFileInput = ref<HTMLInputElement | null>(null);
const draggedSeatKey = ref<string | null>(null);
const dragOverSeatKey = ref<string | null>(null);
const draggedPairKey = ref<string | null>(null);
const dragOverPairKey = ref<string | null>(null);
const { adminPassword, authenticated, setAdminPassword, clearAdminSession } = useAdminSession();

const form = reactive<EditableSeatPlan>({
  name: "座位表",
  rows: 5,
  columns: 6,
  doorSide: "right",
  aisleAfterColumns: [],
  showStudentNo: true,
  rotationConfig: { rules: [] },
  seats: []
});

const sortedSeats = computed(() =>
  [...form.seats].sort((a, b) => a.row - b.row || a.column - b.column)
);

const aisleOptions = computed(() =>
  Array.from({ length: Math.max(form.columns - 1, 0) }, (_, index) => index)
);

const validAisleAfterColumns = computed(() =>
  [...new Set(form.aisleAfterColumns)]
    .filter((column) => column >= 0 && column < form.columns - 1)
    .sort((a, b) => a - b)
);

const aisleColumnSet = computed(() => new Set(validAisleAfterColumns.value));

const deskPairStartColumns = computed(() =>
  Array.from({ length: form.columns }, (_, column) => column)
    .filter((column) => column % 2 === 0 && column + 1 < form.columns && !aisleColumnSet.value.has(column))
);

const deskPairStartColumnSet = computed(() => new Set(deskPairStartColumns.value));

const deskPairHandles = computed(() =>
  Array.from({ length: form.rows }, (_, row) =>
    deskPairStartColumns.value.map((startColumn) => ({ row, startColumn }))
  ).flat()
);

const configGridTemplateColumns = computed(() => {
  const tracks: string[] = [];

  for (let column = 0; column < form.columns; column += 1) {
    tracks.push("8rem");

    if (deskPairStartColumnSet.value.has(column)) {
      tracks.push("0.75rem");
    }

    if (aisleColumnSet.value.has(column)) {
      tracks.push("2rem");
    }
  }

  return tracks.join(" ");
});

function seatKey(seat: Pick<Seat, "row" | "column">) {
  return `${seat.row}:${seat.column}`;
}

function seatGridColumn(column: number) {
  return column + 1 + insertedTrackColumnsBefore(column).length;
}

function aisleGridColumn(column: number) {
  return column + 2 + insertedTrackColumnsBefore(column).length;
}

function deskPairHandleGridColumn(column: number) {
  return column + 2 + insertedTrackColumnsBefore(column).length;
}

function insertedTrackColumnsBefore(column: number) {
  return [
    ...validAisleAfterColumns.value,
    ...deskPairStartColumns.value
  ].filter((insertedColumn) => insertedColumn < column);
}

function hasAisleAfter(column: number) {
  return aisleColumnSet.value.has(column);
}

function toggleAisle(column: number) {
  form.aisleAfterColumns = hasAisleAfter(column)
    ? form.aisleAfterColumns.filter((aisleColumn) => aisleColumn !== column)
    : [...form.aisleAfterColumns, column];
}

function createEmptySeat(row: number, column: number): Seat {
  return { row, column, name: null, studentNo: null };
}

function normalizeText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
    form.aisleAfterColumns = plan.aisleAfterColumns ?? [];
    form.showStudentNo = plan.showStudentNo ?? true;
    form.rotationConfig = plan.rotationConfig ?? { rules: [] };
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
    await verifyAdminPassword(loginPassword.value);
    setAdminPassword(loginPassword.value);
    await loadPlan();
  } catch (err) {
    loginPassword.value = "";
    error.value = err instanceof Error ? err.message : "管理密码错误";
  } finally {
    authenticating.value = false;
  }
}

function leaveAdmin() {
  clearAdminSession();
  loginPassword.value = "";
  form.seats = [];
  clearSeatDrag();
  clearPairDrag();
  message.value = "";
  error.value = "";
}

function clearSeatDrag() {
  draggedSeatKey.value = null;
  dragOverSeatKey.value = null;
}

function clearPairDrag() {
  draggedPairKey.value = null;
  dragOverPairKey.value = null;
}

function findSeatByKey(key: string | null) {
  if (!key) {
    return undefined;
  }

  return form.seats.find((seat) => seatKey(seat) === key);
}

function startSeatDrag(seat: Seat, event: DragEvent) {
  clearPairDrag();
  draggedSeatKey.value = seatKey(seat);
  dragOverSeatKey.value = null;
  event.dataTransfer?.setData("text/plain", draggedSeatKey.value);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
  }
}

function setSeatDragTarget(seat: Seat) {
  if (draggedPairKey.value) {
    const startColumn = pairStartColumnForSeat(seat);
    const key = startColumn === null ? null : pairKey(seat.row, startColumn);
    dragOverPairKey.value = key && key !== draggedPairKey.value ? key : null;
    return;
  }

  const key = seatKey(seat);

  dragOverSeatKey.value = draggedSeatKey.value && draggedSeatKey.value !== key ? key : null;
}

function dropOnSeat(seat: Seat) {
  if (draggedPairKey.value) {
    const startColumn = pairStartColumnForSeat(seat);

    if (startColumn !== null) {
      swapDraggedPair(seat.row, startColumn);
      return;
    }
  }

  swapDraggedSeat(seat);
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

function pairKey(row: number, startColumn: number) {
  return `${row}:${startColumn}`;
}

function parsePairKey(key: string | null) {
  if (!key) {
    return null;
  }

  const [row, startColumn] = key.split(":").map(Number);

  if (!Number.isInteger(row) || !Number.isInteger(startColumn)) {
    return null;
  }

  return { row, startColumn };
}

function pairSeats(row: number, startColumn: number) {
  const leftSeat = form.seats.find((seat) => seat.row === row && seat.column === startColumn);
  const rightSeat = form.seats.find((seat) => seat.row === row && seat.column === startColumn + 1);
  return leftSeat && rightSeat ? [leftSeat, rightSeat] : [];
}

function pairStartColumnForSeat(seat: Seat) {
  if (deskPairStartColumnSet.value.has(seat.column)) {
    return seat.column;
  }

  if (deskPairStartColumnSet.value.has(seat.column - 1)) {
    return seat.column - 1;
  }

  return null;
}

function isPairDragTarget(row: number, startColumn: number) {
  return dragOverPairKey.value === pairKey(row, startColumn);
}

function isSeatInPair(seat: Seat, key: string | null) {
  const pair = parsePairKey(key);

  return Boolean(
    pair &&
    seat.row === pair.row &&
    (seat.column === pair.startColumn || seat.column === pair.startColumn + 1)
  );
}

function startPairDrag(row: number, startColumn: number, event: DragEvent) {
  clearSeatDrag();
  draggedPairKey.value = pairKey(row, startColumn);
  dragOverPairKey.value = null;
  event.dataTransfer?.setData("text/plain", draggedPairKey.value);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
  }
}

function setPairDragTarget(row: number, startColumn: number) {
  const key = pairKey(row, startColumn);
  dragOverPairKey.value = draggedPairKey.value && draggedPairKey.value !== key ? key : null;
}

function swapDraggedPair(row: number, startColumn: number) {
  const source = parsePairKey(draggedPairKey.value);

  if (!source || source.row === row && source.startColumn === startColumn) {
    clearPairDrag();
    return;
  }

  const sourceSeats = pairSeats(source.row, source.startColumn);
  const targetSeats = pairSeats(row, startColumn);

  if (sourceSeats.length !== 2 || targetSeats.length !== 2) {
    clearPairDrag();
    return;
  }

  sourceSeats.forEach((sourceSeat, index) => {
    const targetSeat = targetSeats[index];
    const sourceName = sourceSeat.name;
    const sourceStudentNo = sourceSeat.studentNo;
    sourceSeat.name = targetSeat.name;
    sourceSeat.studentNo = targetSeat.studentNo;
    targetSeat.name = sourceName;
    targetSeat.studentNo = sourceStudentNo;
  });
  clearPairDrag();
}

function exportJson() {
  const payload: EditableSeatPlan = {
    name: form.name,
    rows: Number(form.rows),
    columns: Number(form.columns),
    doorSide: form.doorSide,
    aisleAfterColumns: validAisleAfterColumns.value,
    showStudentNo: form.showStudentNo,
    rotationConfig: form.rotationConfig,
    seats: sortedSeats.value.map((seat) => ({
      row: seat.row,
      column: seat.column,
      name: seat.name,
      studentNo: seat.studentNo
    }))
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeName = form.name.trim() || "seatsheet";
  link.href = url;
  link.download = `${safeName}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function openImportFile() {
  importFileInput.value?.click();
}

async function importJson(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";

  if (!file) {
    return;
  }

  try {
    const payload = JSON.parse(await file.text()) as Partial<EditableSeatPlan>;
    const rows = Number(payload.rows);
    const columns = Number(payload.columns);

    if (!Number.isInteger(rows) || rows < 1 || rows > 30 || !Number.isInteger(columns) || columns < 1 || columns > 30) {
      throw new Error("JSON 中的行列数不正确");
    }

    form.name = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : "导入座位表";
    form.rows = rows;
    form.columns = columns;
    form.doorSide = payload.doorSide === "left" ? "left" : "right";
    form.aisleAfterColumns = Array.isArray(payload.aisleAfterColumns)
      ? payload.aisleAfterColumns
          .map(Number)
          .filter((column) => Number.isInteger(column) && column >= 0 && column < columns - 1)
      : [];
    form.showStudentNo = payload.showStudentNo !== false;
    form.rotationConfig = payload.rotationConfig && Array.isArray(payload.rotationConfig.rules)
      ? payload.rotationConfig
      : { rules: [] };
    form.seats = Array.isArray(payload.seats)
      ? payload.seats
          .map((seat) => ({
            row: Number(seat.row),
            column: Number(seat.column),
            name: normalizeText(seat.name),
            studentNo: normalizeText(seat.studentNo)
          }))
          .filter((seat) =>
            Number.isInteger(seat.row) &&
            seat.row >= 0 &&
            seat.row < rows &&
            Number.isInteger(seat.column) &&
            seat.column >= 0 &&
            seat.column < columns
          )
      : [];
    normalizeSeats();
    message.value = "已导入，保存后生效";
    error.value = "";
  } catch (err) {
    error.value = err instanceof Error ? err.message : "导入失败";
    message.value = "";
  }
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
      aisleAfterColumns: validAisleAfterColumns.value,
      showStudentNo: form.showStudentNo,
      rotationConfig: form.rotationConfig,
      seats: form.seats
    }, adminPassword.value);
    form.name = plan.name;
    form.rows = plan.rows;
    form.columns = plan.columns;
    form.doorSide = plan.doorSide;
    form.aisleAfterColumns = plan.aisleAfterColumns ?? [];
    form.showStudentNo = plan.showStudentNo ?? true;
    form.rotationConfig = plan.rotationConfig ?? { rules: [] };
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
  () => {
    normalizeSeats();

    form.aisleAfterColumns = validAisleAfterColumns.value;
  }
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
              v-model="loginPassword"
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
    <section class="mx-auto w-full">
      <div class="mx-auto mb-6 flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="text-sm text-stone-500">SeatSheet Config</p>
          <h1 class="text-3xl font-semibold tracking-normal">座位表设置</h1>
        </div>
        <div class="flex gap-2">
          <RouterLink
            to="/rotate"
            class="w-fit rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-700 transition hover:border-stone-950 hover:text-stone-950"
          >
            轮换设置
          </RouterLink>
          <RouterLink
            to="/"
            class="w-fit rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-700 transition hover:border-stone-950 hover:text-stone-950"
          >
            返回展示页
          </RouterLink>
        </div>
      </div>

      <div v-if="loading" class="mx-auto max-w-6xl rounded-lg border border-stone-200 bg-white p-5 text-stone-500">
        正在加载设置
      </div>

      <form v-else class="space-y-6" @submit.prevent="submit">
        <div class="mx-auto flex max-w-6xl justify-end">
          <button
            class="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-700 transition hover:border-stone-950 hover:text-stone-950"
            type="button"
            @click="leaveAdmin"
          >
            退出管理
          </button>
        </div>

        <div class="mx-auto grid max-w-6xl gap-4 md:grid-cols-6">
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
          <label class="flex items-end">
            <span class="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700">
              <span class="mb-2 block text-sm text-stone-500">显示学号</span>
              <span class="flex items-center gap-2">
                <input
                  v-model="form.showStudentNo"
                  type="checkbox"
                  class="h-4 w-4 rounded border-stone-300 text-stone-950 focus:ring-stone-950"
                />
                <span>{{ form.showStudentNo ? "开启" : "关闭" }}</span>
              </span>
            </span>
          </label>
          <div class="flex items-end gap-2">
            <button
              class="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 transition hover:border-stone-950 hover:text-stone-950"
              type="button"
              @click="exportJson"
            >
              导出 JSON
            </button>
            <button
              class="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 transition hover:border-stone-950 hover:text-stone-950"
              type="button"
              @click="openImportFile"
            >
              导入 JSON
            </button>
            <input
              ref="importFileInput"
              class="hidden"
              type="file"
              accept="application/json,.json"
              @change="importJson"
            />
          </div>
          <div class="flex items-end">
            <button
              class="w-full rounded-lg bg-stone-950 px-4 py-2 text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
              type="submit"
              :disabled="saving"
            >
              {{ saving ? "保存中" : "保存" }}
            </button>
          </div>
          <div class="md:col-span-6">
            <span class="mb-2 block text-sm text-stone-500">过道位置</span>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="column in aisleOptions"
                :key="column"
                class="rounded-lg border px-3 py-2 text-sm transition"
                :class="hasAisleAfter(column)
                  ? 'border-stone-950 bg-stone-950 text-white'
                  : 'border-stone-300 bg-white text-stone-700 hover:border-stone-950'"
                type="button"
                @click="toggleAisle(column)"
              >
                第 {{ column + 1 }} 列后
              </button>
              <span v-if="aisleOptions.length === 0" class="text-sm text-stone-500">
                至少两列座位才可以添加过道
              </span>
            </div>
          </div>
        </div>

        <p v-if="message" class="mx-auto max-w-6xl text-sm text-emerald-700">{{ message }}</p>
        <p v-if="error" class="mx-auto max-w-6xl text-sm text-red-700">{{ error }}</p>
        <p class="mx-auto max-w-6xl text-sm text-stone-500">
          拖动座位标题可对调单人；拖动同桌中间的三点可整组对调。
        </p>

        <div class="w-full overflow-x-auto pb-2">
          <div class="mx-auto flex w-max items-stretch gap-3">
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
              class="grid gap-2"
              :style="{ gridTemplateColumns: configGridTemplateColumns }"
            >
              <div
                v-for="column in validAisleAfterColumns"
                :key="`aisle:${column}`"
                class="pointer-events-none flex min-h-full items-center justify-center border-x border-dashed border-stone-400 text-xs font-medium text-stone-500"
                :style="{ gridColumn: aisleGridColumn(column), gridRow: `1 / span ${form.rows}` }"
              >
                <span class="vertical-rl tracking-normal">过道</span>
              </div>
              <button
                v-for="pair in deskPairHandles"
                :key="`pair:${pair.row}:${pair.startColumn}`"
                class="flex min-h-full items-center justify-center rounded-md text-stone-400 transition hover:bg-stone-200 hover:text-stone-700"
                :class="{
                  'bg-stone-950 text-white': isPairDragTarget(pair.row, pair.startColumn),
                  'opacity-40': draggedPairKey === pairKey(pair.row, pair.startColumn)
                }"
                :style="{ gridColumn: deskPairHandleGridColumn(pair.startColumn), gridRow: pair.row + 1 }"
                draggable="true"
                title="拖动以交换同桌"
                type="button"
                @dragstart="startPairDrag(pair.row, pair.startColumn, $event)"
                @dragenter.prevent="setPairDragTarget(pair.row, pair.startColumn)"
                @dragover.prevent="setPairDragTarget(pair.row, pair.startColumn)"
                @drop.prevent="swapDraggedPair(pair.row, pair.startColumn)"
                @dragend="clearPairDrag"
              >
                <span class="flex flex-col items-center gap-1">
                  <span class="h-1 w-1 rounded-full bg-current" />
                  <span class="h-1 w-1 rounded-full bg-current" />
                  <span class="h-1 w-1 rounded-full bg-current" />
                </span>
              </button>
              <div
                v-for="seat in sortedSeats"
                :key="seatKey(seat)"
                class="min-w-0 rounded-lg border p-2 shadow-sm transition"
                :style="{ gridColumn: seatGridColumn(seat.column), gridRow: seat.row + 1 }"
                :class="{
                  'border-stone-950 bg-amber-50 shadow-lg ring-2 ring-stone-950 ring-offset-2 ring-offset-stone-100 scale-[1.02]': dragOverSeatKey === seatKey(seat),
                  'border-stone-950 bg-stone-50 shadow-lg ring-2 ring-stone-950 ring-offset-2 ring-offset-stone-100': isSeatInPair(seat, dragOverPairKey),
                  'border-stone-400 bg-white opacity-70': draggedSeatKey === seatKey(seat) || isSeatInPair(seat, draggedPairKey),
                  'border-stone-200 bg-white': draggedSeatKey !== seatKey(seat) && dragOverSeatKey !== seatKey(seat) && !isSeatInPair(seat, draggedPairKey) && !isSeatInPair(seat, dragOverPairKey)
                }"
                @dragenter.prevent="setSeatDragTarget(seat)"
                @dragover.prevent="setSeatDragTarget(seat)"
                @drop.prevent="dropOnSeat(seat)"
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
        </div>
      </form>
    </section>
  </main>
</template>
