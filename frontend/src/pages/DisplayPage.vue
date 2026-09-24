<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RefreshCw, Settings2 } from "@lucide/vue";
import { fetchSeatPlan } from "../api/seatPlan";
import SeatGrid from "../components/SeatGrid.vue";
import type { SeatPlan } from "../types/seat";

const plan = ref<SeatPlan | null>(null);
const loading = ref(true);
const error = ref("");
const occupiedSeats = computed(() => plan.value?.seats.filter((seat) => seat.name || seat.studentNo).length ?? 0);

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
  <main class="display-page">
    <header class="display-header">
      <div class="display-brand"><span class="admin-header__mark" aria-hidden="true">S</span><strong>SeatSheet</strong></div>
      <div class="display-header__actions">
        <button type="button" title="刷新座位表" aria-label="刷新座位表" @click="loadPlan"><RefreshCw :size="18" /></button>
        <RouterLink to="/config"><Settings2 :size="17" />管理座位</RouterLink>
      </div>
    </header>
    <section class="display-content">
      <div class="display-heading">
        <div><span class="display-eyebrow">当前座位表</span><h1>{{ plan?.name || "座位表" }}</h1></div>
        <div v-if="plan" class="display-stats"><span>{{ plan.rows }} 排 × {{ plan.columns }} 列</span><span>{{ occupiedSeats }} / {{ plan.seats.length }} 已安排</span></div>
      </div>
      <div v-if="loading" class="display-loading">正在加载座位表…</div>
      <div v-else-if="error" class="display-loading display-loading--error">{{ error }}</div>
      <div v-else-if="plan" class="display-board">
        <div class="display-front"><span>教室前方</span></div>
        <SeatGrid :rows="plan.rows" :columns="plan.columns" :door-side="plan.doorSide"
          :aisle-after-columns="plan.aisleAfterColumns" :show-student-no="plan.showStudentNo" :seats="plan.seats" />
      </div>
    </section>
  </main>
</template>
