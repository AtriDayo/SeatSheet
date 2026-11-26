<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ArrowUpRight, CalendarDays, Grid2X2, RefreshCw, Settings2 } from "@lucide/vue";
import { fetchSeatPlan } from "../api/seatPlan";
import { isEndfield } from "../state/appearance";
import EndfieldSeatGrid from "../components/EndfieldSeatGrid.vue";
import SeatGrid from "../components/SeatGrid.vue";
import type { SeatPlan } from "../types/seat";

const plan = ref<SeatPlan | null>(null);
const loading = ref(true);
const error = ref("");
const occupied = computed(() => plan.value?.seats.filter(seat => seat.name || seat.studentNo).length ?? 0);
const capacity = computed(() => plan.value ? plan.value.rows * plan.value.columns : 0);
const usage = computed(() => capacity.value ? Math.round(occupied.value / capacity.value * 100) : 0);
const updated = computed(() => plan.value ? new Intl.DateTimeFormat("sv-SE", {
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
}).format(new Date(plan.value.updatedAt)) : "");

async function loadPlan() {
  loading.value = true;
  error.value = "";
  try {
    plan.value = await fetchSeatPlan();
  } catch (err) {
    error.value = err instanceof Error ? err.message : "加载失败";
  } finally {
    loading.value = false;
  }
}
onMounted(loadPlan);
</script>

<template>
  <main v-if="!isEndfield" class="display-page">
    <div class="display-content">
      <header class="display-heading">
        <div class="display-title">
          <h1>{{ plan?.name || "座位表" }}</h1>
          <p v-if="plan" class="display-stats">
            <span>{{ plan.rows }} 排 × {{ plan.columns }} 列</span>
            <span>已安排 {{ occupied }} / {{ plan.seats.length }} 座</span>
          </p>
        </div>
        <div class="display-actions">
          <button type="button" title="刷新座位表" aria-label="刷新座位表" :disabled="loading" @click="loadPlan">
            <RefreshCw :size="17" aria-hidden="true" />
          </button>
          <RouterLink to="/config"><Settings2 :size="16" aria-hidden="true" />管理座位</RouterLink>
        </div>
      </header>
      <div v-if="loading" class="display-loading">正在加载座位表…</div>
      <div v-else-if="error" class="display-loading display-loading--error">{{ error }}</div>
      <div v-else-if="plan" class="display-board">
        <div class="display-front"><span>教室前方</span></div>
        <SeatGrid :rows="plan.rows" :columns="plan.columns" :door-side="plan.doorSide"
          :aisle-after-columns="plan.aisleAfterColumns" :show-student-no="plan.showStudentNo" :seats="plan.seats" />
      </div>
    </div>
  </main>
  <main v-else class="display-page page-shell">
    <header class="page-heading">
      <div class="page-heading__title">
        <span class="eyebrow">// SEATING PLAN</span>
        <h1>{{ plan?.name || "座位表" }}</h1>
      </div>
      <div class="display-actions">
        <button class="workspace-btn" type="button" :disabled="loading" @click="loadPlan"><RefreshCw :size="15" />刷新座位表</button>
        <RouterLink class="workspace-btn workspace-btn--primary" to="/config">管理座位<ArrowUpRight :size="16" /></RouterLink>
      </div>
    </header>
    <p v-if="error" class="workspace-error" role="alert">{{ error }}</p>
    <p v-if="loading && !plan" class="workspace-loading" role="status">正在加载座位表…</p>
    <div v-if="plan" class="display-layout">
      <section class="map-panel" aria-labelledby="map-title">
        <header class="map-heading">
          <div><span class="eyebrow">// FLOOR PLAN</span><h2 id="map-title">教室平面图</h2></div>
          <div class="map-legend"><span><i />已安排</span><span><i class="empty-key" />空座</span></div>
        </header>
        <EndfieldSeatGrid :rows="plan.rows" :columns="plan.columns" :door-side="plan.doorSide"
          :aisle-after-columns="plan.aisleAfterColumns" :show-student-no="plan.showStudentNo" :seats="plan.seats" />
      </section>
      <aside class="plan-info" aria-label="座位表信息">
        <section class="occupancy">
          <span class="eyebrow">// OCCUPANCY</span><h2>座位使用</h2>
          <p class="occupancy-count"><strong>{{ occupied }}</strong><span>/ {{ capacity }} 座</span></p>
          <div class="usage-track" aria-hidden="true"><i :style="{ width: usage + '%' }" /></div>
          <div class="usage-caption"><span>入座率</span><b>{{ usage }}%</b></div>
        </section>
        <section class="layout-facts">
          <span class="eyebrow">// ROOM LAYOUT</span><h2>布局信息</h2>
          <dl>
            <div><dt>教室规模</dt><dd>{{ plan.rows }} 排 × {{ plan.columns }} 列</dd></div>
            <div><dt>过道数量</dt><dd>{{ plan.aisleAfterColumns.length }} 条</dd></div>
            <div><dt>门的位置</dt><dd>{{ plan.doorSide === "left" ? "左侧" : "右侧" }}</dd></div>
            <div><dt>空余座位</dt><dd>{{ capacity - occupied }} 座</dd></div>
          </dl>
        </section>
        <div class="updated-at"><CalendarDays :size="15" /><div><span>上次更新</span><time :datetime="plan.updatedAt">{{ updated }}</time></div></div>
      </aside>
    </div>
    <footer v-if="plan" class="sheet-footer"><span><Grid2X2 :size="13" /> SEATSHEET</span><span>{{ plan.rows }} × {{ plan.columns }} / {{ capacity }} SEATS</span></footer>
  </main>
</template>
