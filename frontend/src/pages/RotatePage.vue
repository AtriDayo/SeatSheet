<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { fetchSeatPlan, saveSeatPlan, verifyAdminPassword } from "../api/seatPlan";
import { useAdminSession } from "../state/adminSession";
import type {
  EditableSeatPlan,
  RotationConfig,
  RotationGroupCycleRule,
  RotationGroupSwapRule,
  RotationRule,
  RotationSeatSwapRule,
  Seat,
  SeatPlan
} from "../types/seat";
import { buildRotationFrames, deriveSeatGroups, type SeatGroup } from "../utils/rotation";

const loading = ref(true);
const saving = ref(false);
const authenticating = ref(false);
const loginPassword = ref("");
const message = ref("");
const error = ref("");
const playingPreview = ref(false);
const previewRuleIndex = ref(-1);
const previewPhase = ref<"idle" | "highlight" | "move" | "settle">("idle");
let previewTimer: ReturnType<typeof setTimeout> | null = null;

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

const groups = computed(() => deriveSeatGroups(form.columns, form.aisleAfterColumns));

const previewFrames = computed(() =>
  buildRotationFrames(form.seats, groups.value, form.rotationConfig)
);

const currentPreviewRule = computed(() =>
  previewRuleIndex.value >= 0
    ? form.rotationConfig.rules[previewRuleIndex.value] ?? null
    : null
);

const previewBaseFrame = computed(() =>
  previewRuleIndex.value >= 0
    ? previewFrames.value[previewRuleIndex.value] ?? previewFrames.value[0]
    : previewFrames.value[0]
);

const previewSettledFrame = computed(() =>
  previewRuleIndex.value >= 0
    ? previewFrames.value[previewRuleIndex.value + 1] ?? previewBaseFrame.value
    : previewFrames.value[0]
);

const activePreviewFrame = computed(() =>
  previewPhase.value === "settle" ? previewSettledFrame.value : previewBaseFrame.value
);

const activePreviewLabel = computed(() => {
  if (previewRuleIndex.value < 0) {
    return "当前座位";
  }

  const rule = currentPreviewRule.value;
  const prefix = `规则 ${previewRuleIndex.value + 1}`;

  if (!rule) {
    return prefix;
  }

  if (rule.type === "groupSwap") {
    return `${prefix}：大组互换`;
  }

  if (rule.type === "groupCycle") {
    return `${prefix}：环形轮换`;
  }

  return `${prefix}：手动互换`;
});

const groupOptions = computed(() =>
  groups.value.map((group) => ({
    value: group.index,
    label: `大组 ${group.index + 1}（第 ${group.startColumn + 1}-${group.endColumn + 1} 列）`,
    width: group.width
  }))
);

const seatOptions = computed(() =>
  Array.from({ length: form.rows * form.columns }, (_, index) => {
    const row = Math.floor(index / form.columns);
    const column = index % form.columns;
    return {
      value: `${row}:${column}`,
      row,
      column,
      label: `第 ${row + 1} 排 / 第 ${column + 1} 列`
    };
  })
);

const validPreviewAisleAfterColumns = computed(() =>
  [...new Set(form.aisleAfterColumns)]
    .filter((column) => column >= 0 && column < form.columns - 1)
    .sort((a, b) => a - b)
);

const previewAisleColumnSet = computed(() => new Set(validPreviewAisleAfterColumns.value));

const previewGridTemplateColumns = computed(() => {
  const tracks: string[] = [];

  for (let column = 0; column < form.columns; column += 1) {
    tracks.push("8rem");

    if (previewAisleColumnSet.value.has(column)) {
      tracks.push("2rem");
    }
  }

  return tracks.join(" ");
});

const sortedPreviewSeats = computed(() =>
  [...(activePreviewFrame.value?.seats ?? form.seats)].sort((a, b) => a.row - b.row || a.column - b.column)
);

function createRuleId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneSeat(seat: Seat): Seat {
  return {
    id: seat.id,
    row: seat.row,
    column: seat.column,
    name: seat.name,
    studentNo: seat.studentNo
  };
}

function normalizeRotationConfig(
  config: RotationConfig,
  seats: Seat[] = form.seats,
  seatGroups: SeatGroup[] = groups.value
) {
  const validGroupIndexes = new Set(seatGroups.map((group) => group.index));
  const validSeatKeys = new Set(seats.map((seat) => `${seat.row}:${seat.column}`));

  return {
    rules: config.rules.filter((rule) => {
      switch (rule.type) {
        case "groupSwap": {
          const sourceGroup = seatGroups.find((group) => group.index === rule.sourceGroupIndex);
          const targetGroup = seatGroups.find((group) => group.index === rule.targetGroupIndex);
          return Boolean(
            sourceGroup &&
            targetGroup &&
            sourceGroup.index !== targetGroup.index &&
            sourceGroup.width === targetGroup.width
          );
        }
        case "groupCycle":
          return validGroupIndexes.has(rule.groupIndex) && rule.steps >= 1;
        case "seatSwap":
          return (
            validSeatKeys.has(`${rule.sourceRow}:${rule.sourceColumn}`) &&
            validSeatKeys.has(`${rule.targetRow}:${rule.targetColumn}`)
          );
      }
    })
  };
}

function toEditablePlan(plan: SeatPlan): EditableSeatPlan {
  const seats = plan.seats.map(cloneSeat);
  const aisleAfterColumns = plan.aisleAfterColumns ?? [];
  const seatGroups = deriveSeatGroups(plan.columns, aisleAfterColumns);

  return {
    name: plan.name,
    rows: plan.rows,
    columns: plan.columns,
    doorSide: plan.doorSide,
    aisleAfterColumns,
    showStudentNo: plan.showStudentNo ?? true,
    rotationConfig: normalizeRotationConfig(plan.rotationConfig ?? { rules: [] }, seats, seatGroups),
    seats
  };
}

async function loadPlan() {
  loading.value = true;
  error.value = "";

  try {
    const plan = await fetchSeatPlan();
    Object.assign(form, toEditablePlan(plan));
    resetPreview();
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
  form.rotationConfig = { rules: [] };
  message.value = "";
  error.value = "";
  stopPreview();
}

function addGroupSwapRule() {
  const sourceGroup = groups.value[0];
  const targetGroup = groups.value.find((group) => group.index !== sourceGroup?.index && group.width === sourceGroup?.width);

  if (!sourceGroup || !targetGroup) {
    error.value = "当前没有可互换的同宽大组";
    return;
  }

  form.rotationConfig.rules.push({
    id: createRuleId("group-swap"),
    type: "groupSwap",
    sourceGroupIndex: sourceGroup.index,
    targetGroupIndex: targetGroup.index
  } satisfies RotationGroupSwapRule);
}

function addGroupCycleRule() {
  const group = groups.value[0];

  if (!group) {
    error.value = "当前没有可轮换的大组";
    return;
  }

  form.rotationConfig.rules.push({
    id: createRuleId("group-cycle"),
    type: "groupCycle",
    groupIndex: group.index,
    direction: "forward",
    steps: 1
  } satisfies RotationGroupCycleRule);
}

function addSeatSwapRule() {
  const source = seatOptions.value[0];
  const target = seatOptions.value[1] ?? source;

  if (!source || !target) {
    error.value = "当前没有足够的座位可设置互换";
    return;
  }

  form.rotationConfig.rules.push({
    id: createRuleId("seat-swap"),
    type: "seatSwap",
    sourceRow: source.row,
    sourceColumn: source.column,
    targetRow: target.row,
    targetColumn: target.column
  } satisfies RotationSeatSwapRule);
}

function removeRule(id: string) {
  form.rotationConfig.rules = form.rotationConfig.rules.filter((rule) => rule.id !== id);
}

function moveRule(id: string, direction: -1 | 1) {
  const index = form.rotationConfig.rules.findIndex((rule) => rule.id === id);
  const targetIndex = index + direction;

  if (index < 0 || targetIndex < 0 || targetIndex >= form.rotationConfig.rules.length) {
    return;
  }

  const nextRules = [...form.rotationConfig.rules];
  const [rule] = nextRules.splice(index, 1);
  nextRules.splice(targetIndex, 0, rule);
  form.rotationConfig.rules = nextRules;
}

function groupSwapTargets(rule: RotationGroupSwapRule) {
  const sourceGroup = groups.value.find((group) => group.index === rule.sourceGroupIndex);

  if (!sourceGroup) {
    return [];
  }

  return groups.value.filter((group) => group.index !== sourceGroup.index && group.width === sourceGroup.width);
}

function updateSeatSwap(rule: RotationSeatSwapRule, field: "source" | "target", value: string) {
  const [row, column] = value.split(":").map(Number);

  if (!Number.isInteger(row) || !Number.isInteger(column)) {
    return;
  }

  if (field === "source") {
    rule.sourceRow = row;
    rule.sourceColumn = column;
    return;
  }

  rule.targetRow = row;
  rule.targetColumn = column;
}

function seatSwapValue(rule: RotationSeatSwapRule, field: "source" | "target") {
  return field === "source"
    ? `${rule.sourceRow}:${rule.sourceColumn}`
    : `${rule.targetRow}:${rule.targetColumn}`;
}

function previewSeatGridColumn(column: number) {
  return column + 1 + validPreviewAisleAfterColumns.value.filter((aisleColumn) => aisleColumn < column).length;
}

function previewAisleGridColumn(column: number) {
  return column + 2 + validPreviewAisleAfterColumns.value.filter((aisleColumn) => aisleColumn < column).length;
}

function cyclicIndex(length: number, current: number) {
  return ((current % length) + length) % length;
}

function previewPositionTerms(row: number, column: number) {
  const aisleCount = validPreviewAisleAfterColumns.value.filter((aisleColumn) => aisleColumn < column).length;

  return {
    row,
    seatColumns: column,
    aisleColumns: aisleCount,
    gaps: column + aisleCount
  };
}

function previewTranslate(fromRow: number, fromColumn: number, toRow: number, toColumn: number) {
  const from = previewPositionTerms(fromRow, fromColumn);
  const to = previewPositionTerms(toRow, toColumn);
  const rowDelta = to.row - from.row;
  const seatColumnDelta = to.seatColumns - from.seatColumns;
  const aisleColumnDelta = to.aisleColumns - from.aisleColumns;
  const gapDelta = to.gaps - from.gaps;

  return `translate(calc(${seatColumnDelta} * 8rem + ${aisleColumnDelta} * 2rem + ${gapDelta} * 0.5rem), calc(${rowDelta} * 5.5rem + ${rowDelta} * 0.5rem))`;
}

function previewTargetForSeat(seat: Seat) {
  const rule = currentPreviewRule.value;

  if (!rule) {
    return null;
  }

  if (rule.type === "seatSwap") {
    if (seat.row === rule.sourceRow && seat.column === rule.sourceColumn) {
      return { row: rule.targetRow, column: rule.targetColumn };
    }

    if (seat.row === rule.targetRow && seat.column === rule.targetColumn) {
      return { row: rule.sourceRow, column: rule.sourceColumn };
    }

    return null;
  }

  if (rule.type === "groupSwap") {
    const sourceGroup = groups.value.find((group) => group.index === rule.sourceGroupIndex);
    const targetGroup = groups.value.find((group) => group.index === rule.targetGroupIndex);

    if (!sourceGroup || !targetGroup || sourceGroup.width !== targetGroup.width) {
      return null;
    }

    const sourceOffset = sourceGroup.columns.indexOf(seat.column);
    if (sourceOffset >= 0) {
      return { row: seat.row, column: targetGroup.columns[sourceOffset] };
    }

    const targetOffset = targetGroup.columns.indexOf(seat.column);
    if (targetOffset >= 0) {
      return { row: seat.row, column: sourceGroup.columns[targetOffset] };
    }

    return null;
  }

  const group = groups.value.find((item) => item.index === rule.groupIndex);

  if (!group || !group.columns.includes(seat.column)) {
    return null;
  }

  const groupSeats = [...(previewBaseFrame.value?.seats ?? [])]
    .filter((item) => group.columns.includes(item.column))
    .sort((a, b) => a.row - b.row || a.column - b.column);
  const currentIndex = groupSeats.findIndex((item) => item.row === seat.row && item.column === seat.column);

  if (currentIndex < 0) {
    return null;
  }

  const step = rule.direction === "forward" ? rule.steps : -rule.steps;
  const target = groupSeats[cyclicIndex(groupSeats.length, currentIndex + step)];
  return target ? { row: target.row, column: target.column } : null;
}

function isPreviewSeatActive(seat: Seat) {
  return Boolean(previewTargetForSeat(seat));
}

function previewSeatStyle(seat: Seat) {
  const target = previewTargetForSeat(seat);
  const transform =
    previewPhase.value === "move" && target
      ? `${previewTranslate(seat.row, seat.column, target.row, target.column)} scale(1.04)`
      : undefined;

  return {
    gridColumn: previewSeatGridColumn(seat.column),
    gridRow: seat.row + 1,
    transform
  };
}

function playPreview() {
  stopPreview();

  if (form.rotationConfig.rules.length === 0) {
    resetPreview();
    return;
  }

  playingPreview.value = true;
  runPreviewRule(0);
}

function runPreviewRule(index: number) {
  if (index >= form.rotationConfig.rules.length) {
    previewRuleIndex.value = Math.max(form.rotationConfig.rules.length - 1, -1);
    previewPhase.value = form.rotationConfig.rules.length > 0 ? "settle" : "idle";
    playingPreview.value = false;
    previewTimer = null;
    return;
  }

  previewRuleIndex.value = index;
  previewPhase.value = "highlight";

  previewTimer = setTimeout(() => {
    previewPhase.value = "move";

    previewTimer = setTimeout(() => {
      previewPhase.value = "settle";

      previewTimer = setTimeout(() => {
        runPreviewRule(index + 1);
      }, 360);
    }, 820);
  }, 520);
}

function resetPreview() {
  stopPreview();
  previewRuleIndex.value = -1;
  previewPhase.value = "idle";
}

function stopPreview() {
  if (previewTimer) {
    clearTimeout(previewTimer);
    previewTimer = null;
  }

  playingPreview.value = false;
}

function previewButtonText() {
  if (playingPreview.value) {
    return "播放中";
  }

  if (previewRuleIndex.value >= 0) {
    return "重新播放";
  }

  return "播放预览";
}

function previewPhaseClass(seat: Seat) {
  if (!isPreviewSeatActive(seat)) {
    return "border-stone-200 bg-white";
  }

  if (previewPhase.value === "highlight") {
    return "z-20 scale-[1.04] border-stone-950 bg-amber-50 shadow-xl ring-2 ring-stone-950 ring-offset-2 ring-offset-stone-100";
  }

  if (previewPhase.value === "move") {
    return "z-30 scale-[1.04] border-stone-950 bg-white shadow-2xl ring-2 ring-stone-950 ring-offset-2 ring-offset-stone-100";
  }

  if (previewPhase.value === "settle") {
    return "border-emerald-300 bg-emerald-50 shadow-md";
  }

  return "border-stone-200 bg-white";
}

function inactivePreviewClass(seat: Seat) {
  if (previewPhase.value !== "move" || isPreviewSeatActive(seat)) {
    return "";
  }

  return "opacity-80";
}

function activeSeatName(seat: Seat) {
  return seat.name || "空座";
}

function activeSeatStudentNo(seat: Seat) {
  return seat.studentNo || "未填写学号";
}

function previewSeatClass(seat: Seat) {
  return [
    "relative h-[5.5rem] w-32 min-w-0 rounded-lg border px-3 py-2 shadow-sm transition-[transform,opacity,box-shadow,border-color,background-color] duration-700 ease-in-out will-change-transform",
    previewPhaseClass(seat),
    inactivePreviewClass(seat)
  ].join(" ");
}

function previewSeatTitleClass() {
  return form.showStudentNo ? "truncate text-base font-medium text-stone-950" : "flex h-full items-center justify-center text-center text-xl font-medium leading-7 text-stone-950";
}

function previewSeatNoClass() {
  return "mt-1 truncate text-sm text-stone-500";
}

function previewStatusText() {
  if (form.rotationConfig.rules.length === 0) {
    return "暂无规则";
  }

  if (previewRuleIndex.value < 0) {
    return "预览会按规则顺序播放";
  }

  if (previewPhase.value === "highlight") {
    return "高亮参与轮换的位置";
  }

  if (previewPhase.value === "move") {
    return "正在移动";
  }

  return "已到达目标位置";
}

async function saveRules() {
  saving.value = true;
  error.value = "";
  message.value = "";

  try {
    form.rotationConfig = normalizeRotationConfig(form.rotationConfig);
    const plan = await saveSeatPlan({
      ...form,
      rotationConfig: form.rotationConfig,
      seats: form.seats.map(cloneSeat)
    }, adminPassword.value);
    Object.assign(form, toEditablePlan(plan));
    message.value = "轮换规则已保存";
  } catch (err) {
    error.value = err instanceof Error ? err.message : "保存失败";
  } finally {
    saving.value = false;
  }
}

async function executeRotation() {
  saving.value = true;
  error.value = "";
  message.value = "";

  try {
    form.rotationConfig = normalizeRotationConfig(form.rotationConfig);
    const frames = buildRotationFrames(form.seats, groups.value, form.rotationConfig);
    const finalSeats = frames[frames.length - 1]?.seats ?? form.seats;
    const plan = await saveSeatPlan({
      ...form,
      rotationConfig: form.rotationConfig,
      seats: finalSeats.map(cloneSeat)
    }, adminPassword.value);
    Object.assign(form, toEditablePlan(plan));
    resetPreview();
    message.value = "已执行一键轮换";
  } catch (err) {
    error.value = err instanceof Error ? err.message : "执行失败";
  } finally {
    saving.value = false;
  }
}

watch(
  () => [form.rows, form.columns, form.aisleAfterColumns.join(","), form.seats.length],
  () => {
    form.rotationConfig = normalizeRotationConfig(form.rotationConfig);
    resetPreview();
  }
);

onMounted(() => {
  if (authenticated.value) {
    loadPlan();
  } else {
    loading.value = false;
  }
});

onUnmounted(() => {
  stopPreview();
});
</script>

<template>
  <main
    v-if="!authenticated"
    class="min-h-screen bg-stone-950 px-5 py-8 text-white"
  >
    <section class="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col justify-between">
      <div class="flex items-center justify-between">
        <p class="text-sm text-stone-400">SeatSheet Rotate</p>
        <RouterLink
          to="/config"
          class="rounded-lg border border-stone-700 px-3 py-2 text-sm text-stone-300 transition hover:border-white hover:text-white"
        >
          返回设置页
        </RouterLink>
      </div>

      <form class="grid gap-10 md:grid-cols-[1fr_minmax(18rem,26rem)] md:items-end" @submit.prevent="authenticate">
        <div>
          <p class="mb-4 text-sm text-stone-400">轮换入口</p>
          <h1 class="max-w-3xl text-4xl font-semibold tracking-normal sm:text-5xl">
            输入管理密码后才能设置并执行一键轮换。
          </h1>
          <p class="mt-5 max-w-2xl text-base leading-7 text-stone-400">
            轮换规则和密码都只保存在当前运行内存中，不写入 Cookie 或浏览器存储。
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
            {{ authenticating ? "验证中" : "进入轮换设置" }}
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
          <p class="text-sm text-stone-500">SeatSheet Rotate</p>
          <h1 class="text-3xl font-semibold tracking-normal">一键轮换设置</h1>
        </div>
        <div class="flex gap-2">
          <RouterLink
            to="/config"
            class="w-fit rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-700 transition hover:border-stone-950 hover:text-stone-950"
          >
            返回设置页
          </RouterLink>
          <button
            class="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-700 transition hover:border-stone-950 hover:text-stone-950"
            type="button"
            @click="leaveAdmin"
          >
            退出管理
          </button>
        </div>
      </div>

      <div v-if="loading" class="mx-auto max-w-6xl rounded-lg border border-stone-200 bg-white p-5 text-stone-500">
        正在加载轮换设置
      </div>

      <div v-else class="space-y-6">
        <div class="mx-auto max-w-6xl rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <div class="mb-3 flex flex-wrap gap-2">
            <button
              class="rounded-lg bg-stone-950 px-3 py-2 text-sm text-white transition hover:bg-stone-800"
              type="button"
              @click="addGroupSwapRule"
            >
              添加大组互换
            </button>
            <button
              class="rounded-lg bg-stone-950 px-3 py-2 text-sm text-white transition hover:bg-stone-800"
              type="button"
              @click="addGroupCycleRule"
            >
              添加环形轮换
            </button>
            <button
              class="rounded-lg bg-stone-950 px-3 py-2 text-sm text-white transition hover:bg-stone-800"
              type="button"
              @click="addSeatSwapRule"
            >
              添加手动互换
            </button>
          </div>
          <div class="flex flex-wrap gap-2 text-sm text-stone-500">
            <span
              v-for="group in groups"
              :key="group.index"
              class="rounded-lg border border-stone-300 px-3 py-2"
            >
              大组 {{ group.index + 1 }}：第 {{ group.startColumn + 1 }}-{{ group.endColumn + 1 }} 列
            </span>
          </div>
        </div>

        <div class="mx-auto max-w-6xl space-y-3">
          <div
            v-for="(rule, index) in form.rotationConfig.rules"
            :key="rule.id"
            class="rounded-lg border border-stone-200 bg-white p-4 shadow-sm"
          >
            <div class="mb-3 flex items-center justify-between gap-3">
              <div class="text-sm font-medium text-stone-950">规则 {{ index + 1 }}</div>
              <div class="flex gap-2">
                <button
                  class="rounded-lg border border-stone-300 px-2 py-1 text-sm text-stone-700"
                  type="button"
                  @click="moveRule(rule.id, -1)"
                >
                  上移
                </button>
                <button
                  class="rounded-lg border border-stone-300 px-2 py-1 text-sm text-stone-700"
                  type="button"
                  @click="moveRule(rule.id, 1)"
                >
                  下移
                </button>
                <button
                  class="rounded-lg border border-red-200 px-2 py-1 text-sm text-red-700"
                  type="button"
                  @click="removeRule(rule.id)"
                >
                  删除
                </button>
              </div>
            </div>

            <div v-if="rule.type === 'groupSwap'" class="grid gap-3 md:grid-cols-2">
              <label class="block">
                <span class="mb-2 block text-sm text-stone-500">来源大组</span>
                <select
                  v-model.number="rule.sourceGroupIndex"
                  class="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 outline-none transition focus:border-stone-950"
                >
                  <option
                    v-for="group in groupOptions"
                    :key="group.value"
                    :value="group.value"
                  >
                    {{ group.label }}
                  </option>
                </select>
              </label>
              <label class="block">
                <span class="mb-2 block text-sm text-stone-500">目标大组</span>
                <select
                  v-model.number="rule.targetGroupIndex"
                  class="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 outline-none transition focus:border-stone-950"
                >
                  <option
                    v-for="group in groupSwapTargets(rule)"
                    :key="group.index"
                    :value="group.index"
                  >
                    大组 {{ group.index + 1 }}（第 {{ group.startColumn + 1 }}-{{ group.endColumn + 1 }} 列）
                  </option>
                </select>
              </label>
            </div>

            <div v-else-if="rule.type === 'groupCycle'" class="grid gap-3 md:grid-cols-3">
              <label class="block">
                <span class="mb-2 block text-sm text-stone-500">轮换大组</span>
                <select
                  v-model.number="rule.groupIndex"
                  class="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 outline-none transition focus:border-stone-950"
                >
                  <option
                    v-for="group in groupOptions"
                    :key="group.value"
                    :value="group.value"
                  >
                    {{ group.label }}
                  </option>
                </select>
              </label>
              <label class="block">
                <span class="mb-2 block text-sm text-stone-500">方向</span>
                <select
                  v-model="rule.direction"
                  class="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 outline-none transition focus:border-stone-950"
                >
                  <option value="forward">向后循环</option>
                  <option value="backward">向前循环</option>
                </select>
              </label>
              <label class="block">
                <span class="mb-2 block text-sm text-stone-500">步数</span>
                <input
                  v-model.number="rule.steps"
                  type="number"
                  min="1"
                  max="200"
                  class="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 outline-none transition focus:border-stone-950"
                />
              </label>
            </div>

            <div v-else class="grid gap-3 md:grid-cols-2">
              <label class="block">
                <span class="mb-2 block text-sm text-stone-500">位置 A</span>
                <select
                  :value="seatSwapValue(rule, 'source')"
                  class="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 outline-none transition focus:border-stone-950"
                  @change="updateSeatSwap(rule, 'source', ($event.target as HTMLSelectElement).value)"
                >
                  <option
                    v-for="seat in seatOptions"
                    :key="seat.value"
                    :value="seat.value"
                  >
                    {{ seat.label }}
                  </option>
                </select>
              </label>
              <label class="block">
                <span class="mb-2 block text-sm text-stone-500">位置 B</span>
                <select
                  :value="seatSwapValue(rule, 'target')"
                  class="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 outline-none transition focus:border-stone-950"
                  @change="updateSeatSwap(rule, 'target', ($event.target as HTMLSelectElement).value)"
                >
                  <option
                    v-for="seat in seatOptions"
                    :key="seat.value"
                    :value="seat.value"
                  >
                    {{ seat.label }}
                  </option>
                </select>
              </label>
            </div>
          </div>

          <div
            v-if="form.rotationConfig.rules.length === 0"
            class="rounded-lg border border-dashed border-stone-300 bg-white p-5 text-sm text-stone-500"
          >
            还没有轮换规则。可以先添加大组互换、环形轮换或手动互换。
          </div>
        </div>

        <div class="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div class="text-sm text-stone-500">动画预览</div>
            <div class="text-base font-medium text-stone-950">{{ activePreviewLabel }}</div>
            <div class="text-sm text-stone-500">{{ previewStatusText() }}</div>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              class="rounded-lg border px-3 py-2 text-sm transition disabled:cursor-not-allowed"
              :class="form.rotationConfig.rules.length > 0
                ? 'border-stone-950 bg-stone-950 text-white hover:bg-stone-800'
                : 'border-stone-300 bg-stone-200 text-stone-400'"
              type="button"
              :disabled="form.rotationConfig.rules.length === 0"
              @click="playPreview"
            >
              {{ previewButtonText() }}
            </button>
            <button
              class="rounded-lg border px-3 py-2 text-sm transition disabled:cursor-not-allowed"
              :class="previewRuleIndex >= 0 || playingPreview
                ? 'border-stone-300 text-stone-700 hover:border-stone-950 hover:text-stone-950'
                : 'border-stone-200 text-stone-400'"
              type="button"
              :disabled="previewRuleIndex < 0 && !playingPreview"
              @click="resetPreview"
            >
              回到开始
            </button>
          </div>
        </div>

        <div v-if="form.rotationConfig.rules.length > 0" class="mx-auto flex max-w-6xl flex-wrap gap-2 text-xs">
          <span
            v-for="(rule, index) in form.rotationConfig.rules"
            :key="rule.id"
            class="rounded-lg border px-2 py-1 transition"
            :class="index === previewRuleIndex
              ? 'border-stone-950 bg-stone-950 text-white'
              : 'border-stone-300 bg-white text-stone-600'"
          >
            {{ index + 1 }}.
            {{ rule.type === "groupSwap" ? "大组互换" : rule.type === "groupCycle" ? "环形轮换" : "手动互换" }}
          </span>
        </div>

        <div class="w-full overflow-x-auto pb-2">
          <div class="mx-auto flex w-max items-stretch gap-3">
            <div v-if="form.doorSide === 'left'" class="flex w-16 shrink-0 flex-col justify-between gap-3 py-1">
              <div class="rounded-lg border border-stone-300 bg-stone-950 px-2 py-3 text-center text-sm font-medium text-white shadow-sm">
                前门
              </div>
              <div class="min-h-8 flex-1 border-l border-dashed border-stone-300" />
              <div class="rounded-lg border border-stone-300 bg-white px-2 py-3 text-center text-sm font-medium text-stone-800 shadow-sm">
                后门
              </div>
            </div>

            <div class="grid gap-2" :style="{ gridTemplateColumns: previewGridTemplateColumns }">
              <div
                v-for="column in validPreviewAisleAfterColumns"
                :key="`preview-aisle:${column}`"
                class="pointer-events-none flex min-h-full items-center justify-center border-x border-dashed border-stone-400 text-xs font-medium text-stone-500"
                :style="{ gridColumn: previewAisleGridColumn(column), gridRow: `1 / span ${form.rows}` }"
              >
                <span class="vertical-rl tracking-normal">过道</span>
              </div>
              <div
                v-for="seat in sortedPreviewSeats"
                :key="`${seat.row}:${seat.column}`"
                :class="previewSeatClass(seat)"
                :style="previewSeatStyle(seat)"
              >
                <div :class="form.showStudentNo ? '' : 'flex h-full items-center justify-center'">
                  <div :class="previewSeatTitleClass()">{{ activeSeatName(seat) }}</div>
                  <div v-if="form.showStudentNo" :class="previewSeatNoClass()">
                    {{ activeSeatStudentNo(seat) }}
                  </div>
                </div>
              </div>
            </div>

            <div v-if="form.doorSide === 'right'" class="flex w-16 shrink-0 flex-col justify-between gap-3 py-1">
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

        <div class="mx-auto flex max-w-6xl flex-wrap gap-2">
          <button
            class="rounded-lg bg-stone-950 px-4 py-2 text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
            type="button"
            :disabled="saving"
            @click="saveRules"
          >
            {{ saving ? "处理中" : "保存轮换规则" }}
          </button>
          <button
            class="rounded-lg border border-stone-950 px-4 py-2 text-stone-950 transition hover:bg-stone-950 hover:text-white disabled:cursor-not-allowed disabled:border-stone-300 disabled:text-stone-400"
            type="button"
            :disabled="saving"
            @click="executeRotation"
          >
            一键执行轮换
          </button>
        </div>

        <p v-if="message" class="mx-auto max-w-6xl text-sm text-emerald-700">{{ message }}</p>
        <p v-if="error" class="mx-auto max-w-6xl text-sm text-red-700">{{ error }}</p>
        <p class="mx-auto max-w-6xl text-sm text-stone-500">
          大组由过道自动切分。环形轮换按组内从前到后、从左到右的格子顺序循环；大组互换目前只允许同宽大组。
        </p>
      </div>
    </section>
  </main>
</template>
