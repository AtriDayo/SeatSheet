<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronUp, Play, Plus, Repeat2, RotateCcw, Save, Trash2, Undo2 } from "@lucide/vue";
import AdminHeader from "../components/AdminHeader.vue";
import AdminLogin from "../components/AdminLogin.vue";
import { fetchSeatPlan, saveSeatPlan, verifyAdminPassword } from "../api/seatPlan";
import { useAdminSession } from "../state/adminSession";
import type {
  EditableSeatPlan,
  RotationGroupCycleRule,
  RotationGroupSwapRule,
  RotationRule,
  RotationSeatSwapRule,
  Seat,
  SeatPlan
} from "../types/seat";
import { buildRotationFrames, cycleColumnsForGroup, cycleTargetRow, deriveSeatGroups, isValidCycleSteps } from "../utils/rotation";

const loading = ref(true);
const planLoaded = ref(false);
const expectedUpdatedAt = ref("");
const saving = ref(false);
const authenticating = ref(false);
const loginPassword = ref("");
const message = ref("");
const error = ref("");
const playingPreview = ref(false);
const previewRuleIndex = ref(-1);
const selectedRuleId = ref<string | null>(null);
const savedRules = ref("");
const previewPhase = ref<"idle" | "highlight" | "move" | "settle" | "final">("idle");
let previewTimer: ReturnType<typeof setTimeout> | null = null;

const { adminPassword, authenticated, setAdminPassword, clearAdminSession } = useAdminSession();

interface PreviewUnit {
  key: string;
  row: number;
  column: number;
  columnSpan: number;
  seats: Seat[];
  target?: {
    row: number;
    column: number;
  };
}

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
const selectedRule = computed(() => form.rotationConfig.rules.find((rule) => rule.id === selectedRuleId.value) ?? null);
const isDirty = computed(() => savedRules.value !== "" && JSON.stringify(form.rotationConfig.rules) !== savedRules.value);
const invalidRules = computed(() => form.rotationConfig.rules.filter((rule) => {
  if (rule.type === "groupSwap") {
    const source = groups.value[rule.sourceGroupIndex], target = groups.value[rule.targetGroupIndex];
    return !source || !target || source === target || source.width !== target.width;
  }
  if (rule.type === "groupCycle") return !groups.value[rule.groupIndex] || !isValidCycleSteps(rule.steps);
  return !form.seats.some((seat) => seat.row === rule.sourceRow && seat.column === rule.sourceColumn) ||
    !form.seats.some((seat) => seat.row === rule.targetRow && seat.column === rule.targetColumn);
}));
const needsReview = computed(() => Boolean(form.rotationConfig.reviewRequired) || invalidRules.value.length > 0);
const validPreviewConfig = computed(() => ({ rules: form.rotationConfig.rules.filter((rule) => !invalidRules.value.includes(rule)) }));
function ruleTitle(rule: RotationRule) {
  return rule.type === "groupSwap" ? "大组互换" : rule.type === "groupCycle" ? "环形轮换" : "单人互换";
}
function ruleSummary(rule: RotationRule) {
  if (rule.type === "groupSwap") return `大组 ${rule.sourceGroupIndex + 1} ↔ 大组 ${rule.targetGroupIndex + 1}`;
  if (rule.type === "groupCycle") return `大组 ${rule.groupIndex + 1} · ${rule.direction === "forward" ? "向后" : "向前"} ${rule.steps} 排`;
  return `${rule.sourceRow + 1} 排 ${rule.sourceColumn + 1} 列 ↔ ${rule.targetRow + 1} 排 ${rule.targetColumn + 1} 列`;
}

const previewFrames = computed(() =>
  buildRotationFrames(form.seats, groups.value, invalidRules.value.length ? { rules: [] } : validPreviewConfig.value)
);

const previewIdentityFrames = computed(() =>
  buildRotationFrames(
    form.seats.map((seat) => ({
      ...seat,
      name: seatKey(seat.row, seat.column),
      studentNo: null
    })),
    groups.value,
    invalidRules.value.length ? { rules: [] } : validPreviewConfig.value
  )
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

const previewBaseIdentities = computed(() =>
  previewIdentityFrames.value[Math.max(previewRuleIndex.value, 0)]?.seats ?? []
);

const previewSettledIdentities = computed(() =>
  previewIdentityFrames.value[Math.max(previewRuleIndex.value + 1, 0)]?.seats ?? []
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
    tracks.push("clamp(6rem, 8vw, 8rem)");

    if (previewAisleColumnSet.value.has(column)) {
      tracks.push("2rem");
    }
  }

  return tracks.join(" ");
});

const movingPreviewUnits = computed(() =>
  buildPreviewUnits(previewBaseFrame.value?.seats ?? form.seats, previewBaseIdentities.value)
);

const activePreviewUnitKeys = computed(() =>
  previewPhase.value === "idle" || previewPhase.value === "final"
    ? new Set<string>()
    : new Set(movingPreviewUnits.value.filter((unit) => unit.target).map((unit) => unit.key))
);

const previewUnits = computed(() =>
  previewPhase.value === "final"
    ? buildSettledPreviewUnits(previewSettledFrame.value?.seats ?? form.seats, previewSettledIdentities.value)
    : movingPreviewUnits.value
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

function toEditablePlan(plan: SeatPlan): EditableSeatPlan {
  const seats = plan.seats.map(cloneSeat);
  const aisleAfterColumns = plan.aisleAfterColumns ?? [];

  return {
    name: plan.name,
    rows: plan.rows,
    columns: plan.columns,
    doorSide: plan.doorSide,
    aisleAfterColumns,
    showStudentNo: plan.showStudentNo ?? true,
    rotationConfig: plan.rotationConfig ?? { rules: [] },
    seats
  };
}

async function loadPlan() {
  loading.value = true;
  planLoaded.value = false;
  error.value = "";

  try {
    const plan = await fetchSeatPlan();
    expectedUpdatedAt.value = plan.updatedAt;
    Object.assign(form, toEditablePlan(plan));
    savedRules.value = JSON.stringify(form.rotationConfig.rules);
    selectedRuleId.value = form.rotationConfig.rules[0]?.id ?? null;
    resetPreview();
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
  if (isDirty.value && !window.confirm("有尚未保存的轮换规则，确定退出管理吗？")) return;
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
  selectedRuleId.value = form.rotationConfig.rules[form.rotationConfig.rules.length - 1]?.id ?? null;
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
  selectedRuleId.value = form.rotationConfig.rules[form.rotationConfig.rules.length - 1]?.id ?? null;
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
  selectedRuleId.value = form.rotationConfig.rules[form.rotationConfig.rules.length - 1]?.id ?? null;
}

function removeRule(id: string) {
  form.rotationConfig.rules = form.rotationConfig.rules.filter((rule) => rule.id !== id);
  if (selectedRuleId.value === id) selectedRuleId.value = form.rotationConfig.rules[0]?.id ?? null;
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

function seatKey(row: number, column: number) {
  return `${row}:${column}`;
}

function sortSeats(seats: Seat[]) {
  return [...seats].sort((a, b) => a.row - b.row || a.column - b.column);
}

function seatMap(seats: Seat[]) {
  return new Map(seats.map((seat) => [seatKey(seat.row, seat.column), seat]));
}

function previewIdentity(identityMap: Map<string, Seat>, seat: Seat) {
  return identityMap.get(seatKey(seat.row, seat.column))?.name ?? seatKey(seat.row, seat.column);
}

function createSeatUnit(seat: Seat, identity: string, target?: { row: number; column: number }): PreviewUnit {
  return {
    key: `seat:${identity}`,
    row: seat.row,
    column: seat.column,
    columnSpan: 1,
    seats: [seat],
    target
  };
}

function buildStaticPreviewUnits(seats: Seat[], identities: Seat[]) {
  const identityMap = seatMap(identities);
  return sortSeats(seats).map((seat) => createSeatUnit(seat, previewIdentity(identityMap, seat)));
}

function buildSettledPreviewUnits(seats: Seat[], identities: Seat[]) {
  const rule = currentPreviewRule.value;

  if (rule?.type === "groupCycle") {
    return buildGroupCyclePreviewUnits(seats, identities, rule).map((unit) => ({
      ...unit,
      target: undefined
    }));
  }

  return buildStaticPreviewUnits(seats, identities);
}

function targetForSeatSwap(seat: Seat, rule: RotationSeatSwapRule) {
  if (seat.row === rule.sourceRow && seat.column === rule.sourceColumn) {
    return { row: rule.targetRow, column: rule.targetColumn };
  }

  if (seat.row === rule.targetRow && seat.column === rule.targetColumn) {
    return { row: rule.sourceRow, column: rule.sourceColumn };
  }

  return undefined;
}

function targetForGroupSwap(seat: Seat, rule: RotationGroupSwapRule) {
  const sourceGroup = groups.value.find((group) => group.index === rule.sourceGroupIndex);
  const targetGroup = groups.value.find((group) => group.index === rule.targetGroupIndex);

  if (!sourceGroup || !targetGroup || sourceGroup.width !== targetGroup.width) {
    return undefined;
  }

  const sourceOffset = sourceGroup.columns.indexOf(seat.column);
  if (sourceOffset >= 0) {
    return { row: seat.row, column: targetGroup.columns[sourceOffset] };
  }

  const targetOffset = targetGroup.columns.indexOf(seat.column);
  if (targetOffset >= 0) {
    return { row: seat.row, column: sourceGroup.columns[targetOffset] };
  }

  return undefined;
}

function buildSeatPreviewUnits(seats: Seat[], identities: Seat[]) {
  const rule = currentPreviewRule.value;
  const sortedSeats = sortSeats(seats);
  const identityMap = seatMap(identities);
  const unitFor = (seat: Seat, target?: { row: number; column: number }) =>
    createSeatUnit(seat, previewIdentity(identityMap, seat), target);

  if (!rule) {
    return sortedSeats.map((seat) => unitFor(seat));
  }

  if (rule.type === "seatSwap") {
    return sortedSeats.map((seat) => unitFor(seat, targetForSeatSwap(seat, rule)));
  }

  if (rule.type === "groupSwap") {
    return sortedSeats.map((seat) => unitFor(seat, targetForGroupSwap(seat, rule)));
  }

  return sortedSeats.map((seat) => unitFor(seat));
}

function buildGroupCyclePreviewUnits(seats: Seat[], identities: Seat[], rule: RotationGroupCycleRule) {
  const group = groups.value.find((item) => item.index === rule.groupIndex);

  if (!group || !isValidCycleSteps(rule.steps)) {
    return buildSeatPreviewUnits(seats, identities);
  }

  const map = seatMap(seats);
  const identityMap = seatMap(identities);
  const units: PreviewUnit[] = [];
  const pairColumns = cycleColumnsForGroup(group);

  for (let row = 0; row < form.rows; row += 1) {
    pairColumns.forEach((columns) => {
      const unitSeats = columns
        .map((column) => map.get(seatKey(row, column)))
        .filter((seat): seat is Seat => Boolean(seat));

      if (unitSeats.length === 0) {
        return;
      }

      const unit: PreviewUnit = {
        key: unitSeats.length === 1 ? `seat:${previewIdentity(identityMap, unitSeats[0])}` : `pair:${unitSeats.map((seat) => previewIdentity(identityMap, seat)).join("|")}`,
        row,
        column: columns[0],
        columnSpan: columns.length,
        seats: unitSeats,
        target: { row: cycleTargetRow(row, form.rows, rule), column: columns[0] }
      };

      units.push(unit);
    });
  }

  const movingColumns = new Set(pairColumns.flat());

  sortSeats(seats)
    .filter((seat) => !movingColumns.has(seat.column))
    .forEach((seat) => units.push(createSeatUnit(seat, previewIdentity(identityMap, seat))));

  return units.sort((left, right) => left.row - right.row || left.column - right.column);
}

function buildPreviewUnits(seats: Seat[], identities: Seat[]) {
  const rule = currentPreviewRule.value;

  if (rule?.type === "groupCycle") {
    return buildGroupCyclePreviewUnits(seats, identities, rule);
  }

  return buildSeatPreviewUnits(seats, identities);
}

function isPreviewUnitActive(unit: PreviewUnit) {
  return activePreviewUnitKeys.value.has(unit.key);
}

function previewUnitStyle(unit: PreviewUnit) {
  const position =
    (previewPhase.value === "move" || previewPhase.value === "settle") && unit.target
      ? unit.target
      : unit;

  return {
    gridColumn: `${previewSeatGridColumn(position.column)} / span ${unit.columnSpan}`,
    gridRow: position.row + 1
  };
}

function playPreview() {
  if (!planLoaded.value || invalidRules.value.length || saving.value) return;
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
    previewPhase.value = form.rotationConfig.rules.length > 0 ? "final" : "idle";
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
        previewPhase.value = "final";

        previewTimer = setTimeout(() => {
          runPreviewRule(index + 1);
        }, 220);
      }, 940);
    }, 980);
  }, 640);
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

function previewPhaseClass(unit: PreviewUnit) {
  if (!isPreviewUnitActive(unit)) {
    return "border-stone-200 bg-white";
  }

  if (previewPhase.value === "highlight") {
    return "z-20 scale-[1.04] border-stone-950 bg-amber-50 shadow-xl ring-2 ring-stone-950 ring-offset-2 ring-offset-stone-100";
  }

  if (previewPhase.value === "move") {
    return "z-30 scale-[1.04] border-stone-950 bg-white shadow-2xl ring-2 ring-stone-950 ring-offset-2 ring-offset-stone-100";
  }

  return "border-stone-200 bg-white";
}

function inactivePreviewClass(unit: PreviewUnit) {
  if (previewPhase.value !== "move" || isPreviewUnitActive(unit)) {
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

function previewUnitClass(unit: PreviewUnit) {
  return [
    "relative min-h-[5.5rem] min-w-0 rounded-lg border bg-white p-2 shadow-sm transition-[transform,opacity,box-shadow,border-color,background-color] duration-[900ms] ease-in-out will-change-transform",
    previewPhaseClass(unit),
    inactivePreviewClass(unit)
  ].join(" ");
}

function previewUnitGridClass(unit: PreviewUnit) {
  return unit.columnSpan > 1 ? "grid h-full grid-cols-2 gap-2" : "h-full";
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

  if (previewPhase.value === "settle") {
    return "正在淡出高亮";
  }

  return "已到达目标位置";
}

async function saveRules() {
  if (!planLoaded.value || saving.value || invalidRules.value.length) return;
  if (needsReview.value && !window.confirm("请确认已逐条核对当前布局下的全部规则。错误的大组或位置可能导致座位表混乱，确定保存并解除警告吗？")) return;
  saving.value = true;
  resetPreview();
  error.value = "";
  message.value = "";

  try {
    const plan = await saveSeatPlan({
      ...form,
      expectedUpdatedAt: expectedUpdatedAt.value,
      operation: "rules",
      rotationConfig: form.rotationConfig,
      seats: form.seats.map(cloneSeat)
    }, adminPassword.value);
    expectedUpdatedAt.value = plan.updatedAt;
    Object.assign(form, toEditablePlan(plan));
    savedRules.value = JSON.stringify(form.rotationConfig.rules);
    message.value = "轮换规则已保存";
  } catch (err) {
    error.value = err instanceof Error ? err.message : "保存失败";
  } finally {
    saving.value = false;
  }
}

async function executeRotation() {
  if (!planLoaded.value || saving.value || playingPreview.value || needsReview.value || isDirty.value || !form.rotationConfig.rules.length) return;
  if (!window.confirm(`将按 ${form.rotationConfig.rules.length} 条规则更新当前座位表，确定执行吗？`)) return;
  saving.value = true;
  error.value = "";
  message.value = "";

  try {
    const frames = buildRotationFrames(form.seats, groups.value, form.rotationConfig);
    const finalSeats = frames[frames.length - 1]?.seats ?? form.seats;
    const plan = await saveSeatPlan({
      ...form,
      expectedUpdatedAt: expectedUpdatedAt.value,
      operation: "rotate",
      rotationConfig: form.rotationConfig,
      seats: finalSeats.map(cloneSeat)
    }, adminPassword.value);
    expectedUpdatedAt.value = plan.updatedAt;
    Object.assign(form, toEditablePlan(plan));
    savedRules.value = JSON.stringify(form.rotationConfig.rules);
    resetPreview();
    message.value = "已执行一键轮换";
  } catch (err) {
    error.value = err instanceof Error ? err.message : "执行失败";
  } finally {
    saving.value = false;
  }
}

async function undoRotation() {
  if (!planLoaded.value || saving.value || playingPreview.value || isDirty.value || !form.rotationConfig.undo) return;
  if (!window.confirm("撤销最近一次轮换，恢复轮换前的全部座位（包括空座），确定吗？")) return;
  saving.value = true;
  error.value = "";
  message.value = "";
  resetPreview();
  try {
    const plan = await saveSeatPlan({ ...form, expectedUpdatedAt: expectedUpdatedAt.value, operation: "undo" }, adminPassword.value);
    expectedUpdatedAt.value = plan.updatedAt;
    Object.assign(form, toEditablePlan(plan));
    savedRules.value = JSON.stringify(form.rotationConfig.rules);
    message.value = "已撤销最近一次轮换";
  } catch (err) {
    error.value = err instanceof Error ? err.message : "撤销失败";
  } finally {
    saving.value = false;
  }
}

watch(() => JSON.stringify(form.rotationConfig.rules), () => resetPreview());

watch(
  () => [form.rows, form.columns, form.aisleAfterColumns.join(","), form.seats.length],
  () => {
    resetPreview();
  }
);

onBeforeRouteLeave(() => !isDirty.value || window.confirm("有尚未保存的轮换规则，确定离开吗？"));

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (!authenticated.value || !isDirty.value) return;
  event.preventDefault();
  event.returnValue = "";
}

watch(() => authenticated.value && isDirty.value, (dirty) => {
  if (dirty) window.addEventListener("beforeunload", onBeforeUnload);
  else window.removeEventListener("beforeunload", onBeforeUnload);
}, { flush: "sync" });

onMounted(() => {
  if (authenticated.value) {
    loadPlan();
  } else {
    loading.value = false;
  }
});

onUnmounted(() => {
  window.removeEventListener("beforeunload", onBeforeUnload);
  stopPreview();
});
</script>

<template>
  <AdminLogin v-if="!authenticated" v-model:password="loginPassword" section="轮换规则"
    :busy="authenticating" :error="error" @submit="authenticate" />

  <main v-else class="admin-page">
    <AdminHeader :name="form.name" :dirty="isDirty" @logout="leaveAdmin" />
    <div class="workspace-title">
      <div>
        <div class="workspace-title__heading">
          <h1>轮换规则</h1>
          <RouterLink class="workspace-title__link" to="/config">
            <ArrowLeft :size="15" aria-hidden="true" /> 座位编辑
          </RouterLink>
        </div>
        <p>按顺序设置规则，随时查看座位变化</p>
      </div>
      <span class="workspace-title__meta">{{ form.rotationConfig.rules.length }} 条规则</span>
    </div>
    <div v-if="loading" class="workspace-loading">正在加载轮换设置…</div>
    <div v-else-if="!planLoaded" class="workspace-error" role="alert">
      <p>{{ error || '座位表加载失败，已禁止轮换以保护原有数据。' }}</p>
      <button class="workspace-btn" type="button" @click="loadPlan">重新加载</button>
    </div>
    <div v-else class="workspace workspace--rotate">
      <section v-if="needsReview" class="rotation-danger" role="alert">
        <AlertTriangle :size="28" aria-hidden="true" />
        <div>
          <h2>危险：轮换规则需要重新核对</h2>
          <p>布局变化可能让大组编号或座位位置指向错误目标，继续执行可能导致座位表损坏或混乱。</p>
          <p>请逐条检查规则，确认无误后保存规则。核对完成前，已禁止执行轮换。</p>
          <p v-if="invalidRules.length">有 {{ invalidRules.length }} 条规则无效，请修改或删除标红的规则；不会自动丢弃任何规则。</p>
        </div>
      </section>
      <aside class="workspace-sidebar">
        <section class="workspace-section">
          <h2>添加规则</h2>
          <div class="rule-add-actions">
            <button class="workspace-btn" type="button" @click="addGroupSwapRule"><Plus :size="14" />大组互换</button>
            <button class="workspace-btn" type="button" @click="addGroupCycleRule"><Plus :size="14" />环形轮换</button>
            <button class="workspace-btn" type="button" @click="addSeatSwapRule"><Plus :size="14" />单人互换</button>
          </div>
        </section>

        <section class="workspace-section">
          <div class="rule-section-heading"><h2>执行顺序</h2><span>{{ form.rotationConfig.rules.length }} 步</span></div>
          <div class="rule-list">
            <div v-for="(rule, index) in form.rotationConfig.rules" :key="rule.id" class="rule-item"
              :class="{ 'is-selected': selectedRuleId === rule.id, 'rule-item--invalid': invalidRules.includes(rule) }">
              <span class="rule-item__number">{{ index + 1 }}.</span>
              <button class="rule-item__body" type="button" @click="selectedRuleId = rule.id">
                <span class="rule-item__title">{{ ruleTitle(rule) }}</span>
                <span class="rule-item__summary">{{ ruleSummary(rule) }}</span>
                <span v-if="invalidRules.includes(rule)" class="text-red-700">规则无效，请检查参数</span>
              </button>
              <div class="rule-item__tools">
                <button type="button" title="上移规则" aria-label="上移规则" :disabled="index === 0" @click="moveRule(rule.id, -1)"><ChevronUp :size="15" /></button>
                <button type="button" title="下移规则" aria-label="下移规则" :disabled="index === form.rotationConfig.rules.length - 1" @click="moveRule(rule.id, 1)"><ChevronDown :size="15" /></button>
                <button type="button" title="删除规则" aria-label="删除规则" @click="removeRule(rule.id)"><Trash2 :size="15" /></button>
              </div>
            </div>
            <p v-if="!form.rotationConfig.rules.length" class="rule-empty">还没有规则</p>
          </div>
        </section>

        <section v-if="selectedRule" class="workspace-section rule-editor">
          <h2>{{ ruleTitle(selectedRule) }} · 参数</h2>
          <template v-if="selectedRule.type === 'groupSwap'">
            <label class="workspace-field"><span>来源大组</span>
              <select v-model.number="selectedRule.sourceGroupIndex" class="workspace-input">
                <option v-for="group in groupOptions" :key="group.value" :value="group.value">{{ group.label }}</option>
              </select>
            </label>
            <label class="workspace-field"><span>目标大组</span>
              <select v-model.number="selectedRule.targetGroupIndex" class="workspace-input">
                <option v-for="group in groupSwapTargets(selectedRule)" :key="group.index" :value="group.index">大组 {{ group.index + 1 }}（第 {{ group.startColumn + 1 }}-{{ group.endColumn + 1 }} 列）</option>
              </select>
            </label>
          </template>
          <template v-else-if="selectedRule.type === 'groupCycle'">
            <label class="workspace-field"><span>轮换大组</span>
              <select v-model.number="selectedRule.groupIndex" class="workspace-input">
                <option v-for="group in groupOptions" :key="group.value" :value="group.value">{{ group.label }}</option>
              </select>
            </label>
            <div class="workspace-field-row">
              <label class="workspace-field"><span>方向</span>
                <select v-model="selectedRule.direction" class="workspace-input"><option value="forward">向后</option><option value="backward">向前</option></select>
              </label>
              <label class="workspace-field"><span>移动排数</span>
                <input v-model.number="selectedRule.steps" type="number" min="1" max="200" step="1" required
                  :aria-invalid="!isValidCycleSteps(selectedRule.steps)" class="workspace-input" />
              </label>
            </div>
            <p v-if="!isValidCycleSteps(selectedRule.steps)" class="workspace-error" role="alert">步数必须是 1–200 的整数。</p>
          </template>
          <template v-else>
            <label class="workspace-field"><span>位置 A</span>
              <select :value="seatSwapValue(selectedRule, 'source')" class="workspace-input" @change="updateSeatSwap(selectedRule, 'source', ($event.target as HTMLSelectElement).value)">
                <option v-for="seat in seatOptions" :key="seat.value" :value="seat.value">{{ seat.label }}</option>
              </select>
            </label>
            <label class="workspace-field"><span>位置 B</span>
              <select :value="seatSwapValue(selectedRule, 'target')" class="workspace-input" @change="updateSeatSwap(selectedRule, 'target', ($event.target as HTMLSelectElement).value)">
                <option v-for="seat in seatOptions" :key="seat.value" :value="seat.value">{{ seat.label }}</option>
              </select>
            </label>
          </template>
        </section>
        <p v-if="error" class="workspace-error workspace-stage__message">{{ error }}</p>
      </aside>

      <section class="workspace-stage rule-preview">
        <div class="stage-heading">
          <div><h2>动态预览</h2><p>{{ activePreviewLabel }} · {{ previewStatusText() }}</p></div>
          <span class="stage-badge">{{ form.rows }} 排 · {{ form.columns }} 列</span>
        </div>
        <div class="rule-preview__toolbar">
          <div class="workspace-button-row">
            <button class="workspace-btn workspace-btn--primary" type="button" :disabled="!form.rotationConfig.rules.length || playingPreview || saving || invalidRules.length > 0" @click="playPreview">
              <Play :size="15" />{{ previewButtonText() }}
            </button>
            <button class="workspace-btn" type="button" :disabled="previewRuleIndex < 0 && !playingPreview" @click="resetPreview">
              <RotateCcw :size="15" />回到开始
            </button>
          </div>
          <span class="rule-preview__status">{{ playingPreview ? `第 ${previewRuleIndex + 1} / ${form.rotationConfig.rules.length} 步` : '预览不修改座位数据' }}</span>
        </div>
        <div class="stage-scroll">
          <div class="stage-canvas">
            <div v-if="form.doorSide === 'left'" class="workspace-door"><span>前门</span><i /><span>后门</span></div>
            <TransitionGroup class="grid gap-2" name="preview-unit" tag="div" :style="{ gridTemplateColumns: previewGridTemplateColumns }">
              <div v-for="column in validPreviewAisleAfterColumns" :key="`preview-aisle:${column}`" class="workspace-aisle"
                :style="{ gridColumn: previewAisleGridColumn(column), gridRow: `1 / span ${form.rows}` }"><span>过道</span></div>
              <div v-for="unit in previewUnits" :key="unit.key" :class="previewUnitClass(unit)" :style="previewUnitStyle(unit)">
                <div :class="previewUnitGridClass(unit)">
                  <div v-for="(seat, seatIndex) in unit.seats" :key="`${unit.key}:${seatIndex}`" class="min-w-0 rounded-md px-1"
                    :class="form.showStudentNo ? '' : 'flex h-full items-center justify-center'">
                    <div :class="previewSeatTitleClass()">{{ activeSeatName(seat) }}</div>
                    <div v-if="form.showStudentNo && (seat.name || seat.studentNo)" :class="previewSeatNoClass()">{{ activeSeatStudentNo(seat) }}</div>
                  </div>
                </div>
              </div>
            </TransitionGroup>
            <div v-if="form.doorSide === 'right'" class="workspace-door"><span>前门</span><i /><span>后门</span></div>
          </div>
        </div>
        <p v-if="message" class="workspace-notice workspace-stage__message">{{ message }}</p>
      </section>

      <footer class="workspace-savebar">
        <span class="workspace-savebar__status">{{ isDirty ? '规则有尚未保存的修改' : message || '规则已保存' }}</span>
        <button class="workspace-btn" type="button" :disabled="saving || playingPreview || isDirty || !form.rotationConfig.undo" @click="undoRotation"><Undo2 :size="15" />撤销一次轮换</button>
        <button class="workspace-btn" type="button" :disabled="saving || playingPreview || invalidRules.length > 0 || (!isDirty && !needsReview)" @click="saveRules"><Save :size="15" />{{ needsReview ? '确认核对并保存' : '保存规则' }}</button>
        <button class="workspace-btn workspace-btn--primary" type="button" :disabled="saving || playingPreview || isDirty || needsReview || !form.rotationConfig.rules.length" @click="executeRotation"><Repeat2 :size="15" />执行轮换</button>
      </footer>
    </div>
  </main>
</template>

<style scoped>
.rotation-danger { grid-column: 1 / -1; display: flex; align-items: flex-start; gap: 16px; padding: 20px; border: 2px solid #dc2626; border-left-width: 8px; background: #fff1f2; color: #991b1b; }
.rotation-danger > svg { flex-shrink: 0; }
.rotation-danger h2 { margin: 0 0 8px; font-size: 20px; font-weight: 700; }
.rotation-danger p { margin: 4px 0; line-height: 1.6; }
.rule-item--invalid { border-left: 3px solid #dc2626; background: #fff1f2; }
@media (max-width: 760px) {
  .workspace--rotate { padding-bottom: 170px; }
  .workspace-savebar { flex-wrap: wrap; }
  .workspace-savebar__status { flex-basis: 100%; }
  .workspace-savebar > button { flex: 1 1 140px; }
  .rotation-danger { gap: 10px; padding: 14px; }
  .rotation-danger h2 { font-size: 18px; }
}
.preview-unit-move {
  transition: transform 940ms cubic-bezier(0.22, 1, 0.36, 1);
}
</style>
