<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import SeatGrid from "../components/SeatGrid.vue";
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
import { applyRotationRule, buildRotationFrames, deriveSeatGroups } from "../utils/rotation";

const loading = ref(true);
const saving = ref(false);
const authenticating = ref(false);
const loginPassword = ref("");
const message = ref("");
const error = ref("");
const previewFrameIndex = ref(0);
const playingPreview = ref(false);
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

const activePreviewFrame = computed(() =>
  previewFrames.value[Math.min(previewFrameIndex.value, previewFrames.value.length - 1)] ?? previewFrames.value[0]
);

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

function normalizeRotationConfig(config: RotationConfig) {
  const validGroupIndexes = new Set(groups.value.map((group) => group.index));
  const validSeatKeys = new Set(form.seats.map((seat) => `${seat.row}:${seat.column}`));

  return {
    rules: config.rules.filter((rule) => {
      switch (rule.type) {
        case "groupSwap": {
          const sourceGroup = groups.value.find((group) => group.index === rule.sourceGroupIndex);
          const targetGroup = groups.value.find((group) => group.index === rule.targetGroupIndex);
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
  return {
    name: plan.name,
    rows: plan.rows,
    columns: plan.columns,
    doorSide: plan.doorSide,
    aisleAfterColumns: plan.aisleAfterColumns ?? [],
    showStudentNo: plan.showStudentNo ?? true,
    rotationConfig: normalizeRotationConfig(plan.rotationConfig ?? { rules: [] }),
    seats: plan.seats.map(cloneSeat)
  };
}

async function loadPlan() {
  loading.value = true;
  error.value = "";

  try {
    const plan = await fetchSeatPlan();
    Object.assign(form, toEditablePlan(plan));
    previewFrameIndex.value = 0;
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

function playPreview() {
  stopPreview();

  if (previewFrames.value.length <= 1) {
    previewFrameIndex.value = 0;
    return;
  }

  playingPreview.value = true;
  previewFrameIndex.value = 0;

  const advance = () => {
    if (previewFrameIndex.value >= previewFrames.value.length - 1) {
      playingPreview.value = false;
      previewTimer = null;
      return;
    }

    previewFrameIndex.value += 1;
    previewTimer = setTimeout(advance, 700);
  };

  previewTimer = setTimeout(advance, 700);
}

function stopPreview() {
  if (previewTimer) {
    clearTimeout(previewTimer);
    previewTimer = null;
  }

  playingPreview.value = false;
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
    previewFrameIndex.value = 0;
    message.value = "已执行一键轮换";
  } catch (err) {
    error.value = err instanceof Error ? err.message : "执行失败";
  } finally {
    saving.value = false;
  }
}

watch(
  () => [form.rows, form.columns, form.aisleAfterColumns, form.rotationConfig.rules.length],
  () => {
    form.rotationConfig = normalizeRotationConfig(form.rotationConfig);
    previewFrameIndex.value = Math.min(previewFrameIndex.value, Math.max(previewFrames.value.length - 1, 0));
  },
  { deep: true }
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

        <div class="mx-auto max-w-6xl rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div class="text-sm text-stone-500">动画预览</div>
              <div class="text-base font-medium text-stone-950">
                {{ activePreviewFrame?.label || "当前座位" }}
              </div>
            </div>
            <div class="flex gap-2">
              <button
                class="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-700 transition hover:border-stone-950 hover:text-stone-950"
                type="button"
                @click="playPreview"
              >
                {{ playingPreview ? "播放中" : "播放预览" }}
              </button>
              <button
                class="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-700 transition hover:border-stone-950 hover:text-stone-950"
                type="button"
                @click="stopPreview(); previewFrameIndex = 0"
              >
                回到开始
              </button>
            </div>
          </div>

          <Transition name="fade-slide" mode="out-in">
            <div :key="`${activePreviewFrame?.label}-${previewFrameIndex}`">
              <SeatGrid
                :rows="form.rows"
                :columns="form.columns"
                :door-side="form.doorSide"
                :aisle-after-columns="form.aisleAfterColumns"
                :show-student-no="form.showStudentNo"
                :seats="activePreviewFrame?.seats ?? form.seats"
              />
            </div>
          </Transition>
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

<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 220ms ease, transform 220ms ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}
</style>
