<script setup lang="ts">
import { onMounted, ref } from "vue";
import { fetchSeatPlan } from "../api/seatPlan";
import SeatGrid from "../components/SeatGrid.vue";
import type { SeatPlan } from "../types/seat";

const plan = ref<SeatPlan | null>(null);
const loading = ref(true);
const error = ref("");

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
  <main class="min-h-screen bg-stone-100 px-5 py-8 text-stone-950">
    <section class="mx-auto max-w-7xl">
      <div class="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="text-sm text-stone-500">SeatSheet</p>
          <h1 class="text-3xl font-semibold tracking-normal">{{ plan?.name || "座位表" }}</h1>
        </div>
        <RouterLink
          to="/config"
          class="w-fit rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-700 transition hover:border-stone-950 hover:text-stone-950"
        >
          管理座位
        </RouterLink>
      </div>

      <div v-if="loading" class="rounded-lg border border-stone-200 bg-white p-5 text-stone-500">
        正在加载座位表
      </div>
      <div v-else-if="error" class="rounded-lg border border-red-200 bg-red-50 p-5 text-red-700">
        {{ error }}
      </div>
      <SeatGrid
        v-else-if="plan"
        :rows="plan.rows"
        :columns="plan.columns"
        :door-side="plan.doorSide"
        :seats="plan.seats"
      />
    </section>
  </main>
</template>
