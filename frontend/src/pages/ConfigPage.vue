<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { ArrowRight, Download, GripVertical, Save, Upload } from "@lucide/vue";
import AdminHeader from "../components/AdminHeader.vue";
import AdminLogin from "../components/AdminLogin.vue";
import { fetchSeatPlan, saveSeatPlan, verifyAdminPassword } from "../api/seatPlan";
import type { EditableSeatPlan, Seat } from "../types/seat";
import { useAdminSession } from "../state/adminSession";
import { deriveSeatGroups, deskPairColumnsForGroup } from "../utils/rotation";
import { parseImportedSeatPlan } from "../utils/seatImport";
import { swapSeatLines } from "../utils/seatSwap";

const loading = ref(true);
const planLoaded = ref(false);
const expectedUpdatedAt = ref("");
const draftRows = ref<number | string>(5);
const draftColumns = ref<number | string>(6);
const clippedSeats = new Map<string, Seat>();
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
const draggedRow = ref<number | null>(null);
const dragOverRow = ref<number | null>(null);
const draggedColumn = ref<number | null>(null);
const dragOverColumn = ref<number | null>(null);
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

const savedSnapshot = ref("");
function planSnapshot() {
  return JSON.stringify({ name: form.name, rows: form.rows, columns: form.columns,
    doorSide: form.doorSide, aisleAfterColumns: [...form.aisleAfterColumns].sort((a, b) => a - b),
    showStudentNo: form.showStudentNo, rotationConfig: form.rotationConfig,
    seats: form.seats.map(({ row, column, name, studentNo }) => ({ row, column, name, studentNo })) });
}
const dimensionsDirty = computed(() => Number(draftRows.value) !== form.rows || Number(draftColumns.value) !== form.columns);
const isDirty = computed(() => savedSnapshot.value !== "" && (planSnapshot() !== savedSnapshot.value || dimensionsDirty.value));

function applyDimensions() {
  const rows = Number(draftRows.value), columns = Number(draftColumns.value);
  if (!Number.isInteger(rows) || rows < 1 || rows > 30 || !Number.isInteger(columns) || columns < 1 || columns > 30) {
    error.value = "排数和列数必须是 1–30 的整数，座位名单未变动。";
    return false;
  }
  if (!dimensionsDirty.value) return true;
  const removed = form.seats.filter((seat) => (seat.row >= rows || seat.column >= columns) && (seat.name || seat.studentNo));
  if (removed.length && !window.confirm(`缩小布局将移除 ${removed.length} 个已填写的座位。保存前恢复原行列数可以找回，确定调整吗？`)) return false;
  form.seats.forEach((seat) => clippedSeats.set(seatKey(seat), { ...seat }));
  form.rows = rows;
  form.columns = columns;
  form.seats = [...clippedSeats.values()];
  normalizeSeats();
  form.aisleAfterColumns = validAisleAfterColumns.value;
  error.value = "";
  return true;
}

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
  deriveSeatGroups(form.columns, validAisleAfterColumns.value)
    .flatMap(deskPairColumnsForGroup)
    .map((columns) => columns[0])
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

  return ["3rem", ...tracks].join(" ");
});

const configGridTemplateRows = computed(() => `2rem repeat(${form.rows}, auto)`);

function columnLabel(column: number) {
  return column < 26 ? String.fromCharCode(65 + column) : `A${String.fromCharCode(65 + column - 26)}`;
}

function seatKey(seat: Pick<Seat, "row" | "column">) {
  return `${seat.row}:${seat.column}`;
}

function seatGridColumn(column: number) {
  return column + 2 + insertedTrackColumnsBefore(column).length;
}

function aisleGridColumn(column: number) {
  return column + 3 + insertedTrackColumnsBefore(column).length;
}

function deskPairHandleGridColumn(column: number) {
  return column + 3 + insertedTrackColumnsBefore(column).length;
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
  planLoaded.value = false;
  error.value = "";

  try {
    const plan = await fetchSeatPlan();
    expectedUpdatedAt.value = plan.updatedAt;
    clippedSeats.clear();
    form.name = plan.name;
    form.rows = plan.rows;
    form.columns = plan.columns;
    draftRows.value = plan.rows;
    draftColumns.value = plan.columns;
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
    await nextTick();
    savedSnapshot.value = planSnapshot();
    planLoaded.value = true;
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
  if (isDirty.value && !window.confirm("有尚未保存的座位修改，确定退出管理吗？")) return;
  clearAdminSession();
  loginPassword.value = "";
  form.seats = [];
  clearSeatDrag();
  clearPairDrag();
  clearLineDrag();
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

function clearLineDrag() {
  draggedRow.value = null;
  dragOverRow.value = null;
  draggedColumn.value = null;
  dragOverColumn.value = null;
}

function startLineDrag(axis: "row" | "column", index: number, event: DragEvent) {
  clearSeatDrag();
  clearPairDrag();
  clearLineDrag();
  if (axis === "row") draggedRow.value = index;
  else draggedColumn.value = index;
  event.dataTransfer?.setData("text/plain", `${axis}:${index}`);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

function setLineDragTarget(axis: "row" | "column", index: number) {
  if (axis === "row") dragOverRow.value = draggedRow.value !== null && draggedRow.value !== index ? index : null;
  else dragOverColumn.value = draggedColumn.value !== null && draggedColumn.value !== index ? index : null;
}

function dropOnLine(axis: "row" | "column", index: number) {
  const source = axis === "row" ? draggedRow.value : draggedColumn.value;
  if (source !== null && source !== index) swapSeatLines(form.seats, axis, source, index);
  clearLineDrag();
}

function findSeatByKey(key: string | null) {
  if (!key) {
    return undefined;
  }

  return form.seats.find((seat) => seatKey(seat) === key);
}

function startSeatDrag(seat: Seat, event: DragEvent) {
  clearPairDrag();
  clearLineDrag();
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
  clearLineDrag();
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
    const imported = parseImportedSeatPlan(await file.text());
    Object.assign(form, imported);
    draftRows.value = imported.rows;
    draftColumns.value = imported.columns;
    clippedSeats.clear();
    message.value = "已导入，保存后生效";
    error.value = "";
  } catch (err) {
    error.value = err instanceof Error ? err.message : "导入失败";
    message.value = "";
  }
}

async function submit() {
  if (!planLoaded.value || saving.value || !applyDimensions()) return;
  saving.value = true;
  error.value = "";
  message.value = "";

  try {
    const plan = await saveSeatPlan({
      expectedUpdatedAt: expectedUpdatedAt.value,
      operation: "edit",
      name: form.name,
      rows: Number(form.rows),
      columns: Number(form.columns),
      doorSide: form.doorSide,
      aisleAfterColumns: validAisleAfterColumns.value,
      showStudentNo: form.showStudentNo,
      rotationConfig: form.rotationConfig,
      seats: form.seats
    }, adminPassword.value);
    expectedUpdatedAt.value = plan.updatedAt;
    clippedSeats.clear();
    form.name = plan.name;
    form.rows = plan.rows;
    form.columns = plan.columns;
    draftRows.value = plan.rows;
    draftColumns.value = plan.columns;
    form.doorSide = plan.doorSide;
    form.aisleAfterColumns = plan.aisleAfterColumns ?? [];
    form.showStudentNo = plan.showStudentNo ?? true;
    form.rotationConfig = plan.rotationConfig ?? { rules: [] };
    form.seats = plan.seats;
    await nextTick();
    savedSnapshot.value = planSnapshot();
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
    draftRows.value = form.rows;
    draftColumns.value = form.columns;
  }
);

onBeforeRouteLeave(() => !isDirty.value || window.confirm("有尚未保存的座位修改，确定离开吗？"));

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (!authenticated.value || !isDirty.value) return;
  event.preventDefault();
  event.returnValue = "";
}

watch(() => authenticated.value && isDirty.value, (dirty) => {
  if (dirty) window.addEventListener("beforeunload", onBeforeUnload);
  else window.removeEventListener("beforeunload", onBeforeUnload);
}, { flush: "sync" });
onUnmounted(() => window.removeEventListener("beforeunload", onBeforeUnload));

onMounted(() => {
  if (authenticated.value) {
    loadPlan();
  } else {
    loading.value = false;
  }
});
</script>

<template>
  <AdminLogin v-if="!authenticated" v-model:password="loginPassword" section="座位编辑"
    :busy="authenticating" :error="error" @submit="authenticate" />

  <main v-else class="admin-page">
    <AdminHeader :name="form.name" :dirty="isDirty" @logout="leaveAdmin" />
    <div class="workspace-title">
      <div>
        <div class="workspace-title__heading">
          <h1>座位编辑</h1>
          <RouterLink class="workspace-title__link" to="/rotate">
            轮换规则 <ArrowRight :size="15" aria-hidden="true" />
          </RouterLink>
        </div>
        <p>管理班级布局与座位名单</p>
      </div>
      <span class="workspace-title__meta">{{ form.rows }} 排 · {{ form.columns }} 列 · {{ form.seats.length }} 座</span>
    </div>

    <div v-if="loading" class="workspace-loading">正在加载座位表…</div>
    <div v-else-if="!planLoaded" class="workspace-error" role="alert">
      <p>{{ error || '座位表加载失败，已停止编辑以保护原有数据。' }}</p>
      <button class="workspace-btn" type="button" @click="loadPlan">重新加载</button>
    </div>
    <form v-else class="workspace workspace--config" @submit.prevent="submit">
      <aside class="workspace-sidebar">
        <section class="workspace-section">
          <h2>基本信息</h2>
          <label class="workspace-field">
            <span>座位表名称</span>
            <input v-model="form.name" class="workspace-input" maxlength="80" required />
          </label>
          <div class="workspace-field-row">
            <label class="workspace-field">
              <span>排数</span>
              <input v-model.number="draftRows" class="workspace-input" type="number" min="1" max="30" />
            </label>
            <label class="workspace-field">
              <span>列数</span>
              <input v-model.number="draftColumns" class="workspace-input" type="number" min="1" max="30" />
            </label>
          </div>
          <button v-if="dimensionsDirty" class="workspace-btn" type="button" @click="applyDimensions">应用布局</button>
        </section>

        <section class="workspace-section">
          <h2>教室布局</h2>
          <label class="workspace-field">
            <span>门的位置</span>
            <select v-model="form.doorSide" class="workspace-input">
              <option value="left">左侧</option>
              <option value="right">右侧</option>
            </select>
          </label>
          <div class="workspace-field">
            <span>过道位置</span>
            <div class="workspace-aisles">
              <button v-for="column in aisleOptions" :key="column" type="button"
                :class="{ 'is-active': hasAisleAfter(column) }"
                :aria-pressed="hasAisleAfter(column)"
                :title="`第 ${column + 1} 列后设置过道`" @click="toggleAisle(column)">
                {{ column + 1 }} / {{ column + 2 }}
              </button>
            </div>
          </div>
          <label class="workspace-toggle">
            显示学号
            <input v-model="form.showStudentNo" type="checkbox" />
          </label>
        </section>

        <section class="workspace-section">
          <h2>数据</h2>
          <div class="workspace-button-row">
            <button class="workspace-btn" type="button" @click="exportJson"><Download :size="15" />导出</button>
            <button class="workspace-btn" type="button" @click="openImportFile"><Upload :size="15" />导入</button>
          </div>
          <input ref="importFileInput" class="hidden" type="file" accept="application/json,.json" @change="importJson" />
        </section>
      </aside>

      <section class="workspace-stage">
        <div class="stage-heading">
          <div>
            <h2>座位图</h2>
            <p>第 1 排为前方</p>
          </div>
          <span class="stage-badge">{{ form.aisleAfterColumns.length }} 条过道</span>
        </div>
        <p v-if="error" class="workspace-error workspace-stage__message">{{ error }}</p>
        <p v-if="message" class="workspace-notice workspace-stage__message">{{ message }}</p>
        <div class="stage-scroll">
          <div class="stage-canvas">
            <div v-if="form.doorSide === 'left'" class="workspace-door">
              <span>前门</span><i /><span>后门</span>
            </div>
            <div class="grid gap-2" :style="{ gridTemplateColumns: configGridTemplateColumns, gridTemplateRows: configGridTemplateRows }">
              <button v-for="column in form.columns" :key="`column:${column}`" type="button"
                class="workspace-line-handle" :class="{ 'is-target': dragOverColumn === column - 1, 'is-dragged': draggedColumn === column - 1 }"
                :style="{ gridColumn: seatGridColumn(column - 1), gridRow: 1 }"
                draggable="true" :title="`拖动以交换整列：${columnLabel(column - 1)} 列`"
                :aria-label="`拖动以交换第 ${column} 列`"
                @dragstart="startLineDrag('column', column - 1, $event)"
                @dragenter.prevent="setLineDragTarget('column', column - 1)"
                @dragover.prevent="setLineDragTarget('column', column - 1)"
                @drop.prevent="dropOnLine('column', column - 1)" @dragend="clearLineDrag">
                <GripVertical :size="12" aria-hidden="true" />{{ columnLabel(column - 1) }} 列
              </button>
              <button v-for="row in form.rows" :key="`row:${row}`" type="button"
                class="workspace-line-handle workspace-line-handle--row"
                :class="{ 'is-target': dragOverRow === row - 1, 'is-dragged': draggedRow === row - 1 }"
                :style="{ gridColumn: 1, gridRow: row + 1 }"
                draggable="true" :title="`拖动以交换整排：第 ${row} 排`"
                :aria-label="`拖动以交换第 ${row} 排`"
                @dragstart="startLineDrag('row', row - 1, $event)"
                @dragenter.prevent="setLineDragTarget('row', row - 1)"
                @dragover.prevent="setLineDragTarget('row', row - 1)"
                @drop.prevent="dropOnLine('row', row - 1)" @dragend="clearLineDrag">
                <GripVertical :size="12" aria-hidden="true" />{{ row }} 排
              </button>
              <div v-for="column in validAisleAfterColumns" :key="`aisle:${column}`" class="workspace-aisle"
                :style="{ gridColumn: aisleGridColumn(column), gridRow: `2 / span ${form.rows}` }">
                <span>过道</span>
              </div>
              <button v-for="pair in deskPairHandles" :key="`pair:${pair.row}:${pair.startColumn}`"
                class="workspace-pair-handle" :class="{ 'is-target': isPairDragTarget(pair.row, pair.startColumn) }"
                :style="{ gridColumn: deskPairHandleGridColumn(pair.startColumn), gridRow: pair.row + 2 }"
                draggable="true" title="拖动以交换同桌" :aria-label="`交换第 ${pair.row + 1} 排第 ${pair.startColumn + 1}-${pair.startColumn + 2} 列的同桌`" type="button"
                @dragstart="startPairDrag(pair.row, pair.startColumn, $event)"
                @dragenter.prevent="setPairDragTarget(pair.row, pair.startColumn)"
                @dragover.prevent="setPairDragTarget(pair.row, pair.startColumn)"
                @drop.prevent="swapDraggedPair(pair.row, pair.startColumn)" @dragend="clearPairDrag">
                <GripVertical :size="14" />
              </button>
              <div v-for="seat in sortedSeats" :key="seatKey(seat)" class="editor-seat"
                :class="{ 'is-target': dragOverSeatKey === seatKey(seat) || isSeatInPair(seat, dragOverPairKey) || dragOverRow === seat.row || dragOverColumn === seat.column,
                  'is-dragged': draggedSeatKey === seatKey(seat) || isSeatInPair(seat, draggedPairKey) || draggedRow === seat.row || draggedColumn === seat.column }"
                :style="{ gridColumn: seatGridColumn(seat.column), gridRow: seat.row + 2 }"
                @dragenter.prevent="setSeatDragTarget(seat)" @dragover.prevent="setSeatDragTarget(seat)"
                @drop.prevent="dropOnSeat(seat)">
                <div class="editor-seat__handle" draggable="true" title="拖动以交换座位"
                  @dragstart="startSeatDrag(seat, $event)" @dragend="clearSeatDrag">
                  {{ seat.row + 1 }} 排 · {{ seat.column + 1 }} 列
                </div>
                <input v-model="seat.name" :aria-label="`第 ${seat.row + 1} 排第 ${seat.column + 1} 列姓名`" placeholder="姓名" />
                <input v-model="seat.studentNo" :aria-label="`第 ${seat.row + 1} 排第 ${seat.column + 1} 列学号`" placeholder="学号" />
              </div>
            </div>
            <div v-if="form.doorSide === 'right'" class="workspace-door">
              <span>前门</span><i /><span>后门</span>
            </div>
          </div>
        </div>
      </section>

      <footer class="workspace-savebar">
        <span class="workspace-savebar__status">{{ isDirty ? '有尚未保存的修改' : message || '所有修改已保存' }}</span>
        <button class="workspace-btn workspace-btn--primary" type="submit" :disabled="saving || !isDirty">
          <Save :size="16" />{{ saving ? '保存中…' : '保存座位表' }}
        </button>
      </footer>
    </form>
  </main>
</template>
