<script setup lang="ts">
import { computed } from "vue";
import type { Seat } from "../types/seat";

const props = defineProps<{
  rows: number;
  columns: number;
  seats: Seat[];
}>();

function seatKey(row: number, column: number) {
  return `${row}:${column}`;
}

const seatMap = computed(() => new Map(props.seats.map((seat) => [seatKey(seat.row, seat.column), seat])));
</script>

<template>
  <div
    class="grid gap-3"
    :style="{ gridTemplateColumns: `repeat(${columns}, minmax(8rem, 1fr))` }"
  >
    <div
      v-for="index in rows * columns"
      :key="index"
      class="min-h-20 rounded-lg border border-stone-200 bg-white px-4 py-3 shadow-sm"
    >
      <template v-if="seatMap.get(seatKey(Math.floor((index - 1) / columns), (index - 1) % columns))">
        <div class="truncate text-base font-medium text-stone-950">
          {{
            seatMap.get(seatKey(Math.floor((index - 1) / columns), (index - 1) % columns))
              ?.name || "空座"
          }}
        </div>
        <div class="mt-1 truncate text-sm text-stone-500">
          {{
            seatMap.get(seatKey(Math.floor((index - 1) / columns), (index - 1) % columns))
              ?.studentNo || "未填写学号"
          }}
        </div>
      </template>
    </div>
  </div>
</template>
