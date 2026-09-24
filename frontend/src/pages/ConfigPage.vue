<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { Download, GripVertical, Save, Upload } from "@lucide/vue";
import AdminHeader from "../components/AdminHeader.vue";
import AdminLogin from "../components/AdminLogin.vue";
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

const savedSnapshot = ref("");
function planSnapshot() {
  return JSON.stringify({ name: form.name, rows: form.rows, columns: form.columns,
    doorSide: form.doorSide, aisleAfterColumns: [...form.aisleAfterColumns].sort((a, b) => a - b),
    showStudentNo: form.showStudentNo, rotationConfig: form.rotationConfig,
    seats: form.seats.map(({ row, column, name, studentNo }) => ({ row, column, name, studentNo })) });
}
const isDirty = computed(() => savedSnapshot.value !== "" && planSnapshot() !== savedSnapshot.value);

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
    await nextTick();
    savedSnapshot.value = planSnapshot();
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
    normalizeSeats();

    form.aisleAfterColumns = validAisleAfterColumns.value;
  }
);

onBeforeRouteLeave(() => !isDirty.value || window.confirm("有尚未保存的座位修改，确定离开吗？"));

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
    <AdminHeader active="config" :name="form.name" :dirty="isDirty" @logout="leaveAdmin" />
    <div class="workspace-title">
      <div>
        <h1>座位编辑</h1>
        <p>管理班级布局与座位名单</p>
      </div>
      <span class="workspace-title__meta">{{ form.rows }} 排 · {{ form.columns }} 列 · {{ form.seats.length }} 座</span>
    </div>

    <div v-if="loading" class="workspace-loading">正在加载座位表…</div>
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
              <input v-model.number="form.rows" class="workspace-input" type="number" min="1" max="30" />
            </label>
            <label class="workspace-field">
              <span>列数</span>
              <input v-model.number="form.columns" class="workspace-input" type="number" min="1" max="30" />
            </label>
          </div>
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
            <div class="grid gap-2" :style="{ gridTemplateColumns: configGridTemplateColumns }">
              <div v-for="column in validAisleAfterColumns" :key="`aisle:${column}`" class="workspace-aisle"
                :style="{ gridColumn: aisleGridColumn(column), gridRow: `1 / span ${form.rows}` }">
                <span>过道</span>
              </div>
              <button v-for="pair in deskPairHandles" :key="`pair:${pair.row}:${pair.startColumn}`"
                class="workspace-pair-handle" :class="{ 'is-target': isPairDragTarget(pair.row, pair.startColumn) }"
                :style="{ gridColumn: deskPairHandleGridColumn(pair.startColumn), gridRow: pair.row + 1 }"
                draggable="true" title="拖动以交换同桌" :aria-label="`交换第 ${pair.row + 1} 排第 ${pair.startColumn + 1}-${pair.startColumn + 2} 列的同桌`" type="button"
                @dragstart="startPairDrag(pair.row, pair.startColumn, $event)"
                @dragenter.prevent="setPairDragTarget(pair.row, pair.startColumn)"
                @dragover.prevent="setPairDragTarget(pair.row, pair.startColumn)"
                @drop.prevent="swapDraggedPair(pair.row, pair.startColumn)" @dragend="clearPairDrag">
                <GripVertical :size="14" />
              </button>
              <div v-for="seat in sortedSeats" :key="seatKey(seat)" class="editor-seat"
                :class="{ 'is-target': dragOverSeatKey === seatKey(seat) || isSeatInPair(seat, dragOverPairKey),
                  'is-dragged': draggedSeatKey === seatKey(seat) || isSeatInPair(seat, draggedPairKey) }"
                :style="{ gridColumn: seatGridColumn(seat.column), gridRow: seat.row + 1 }"
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
