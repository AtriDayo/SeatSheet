<script setup lang="ts">
import { computed } from "vue";
import type { DoorSide, Seat } from "../types/seat";

const props = defineProps<{
  rows: number;
  columns: number;
  doorSide: DoorSide;
  seats: Seat[];
}>();

function seatKey(row: number, column: number) {
  return `${row}:${column}`;
}

const seatMap = computed(() => new Map(props.seats.map((seat) => [seatKey(seat.row, seat.column), seat])));
</script>

<template>
  <div class="flex items-stretch gap-3 overflow-x-auto pb-2">
    <div
      v-if="doorSide === 'left'"
      class="flex min-w-20 flex-col justify-between gap-3 py-1"
    >
      <div class="rounded-lg border border-stone-300 bg-stone-950 px-3 py-4 text-center text-sm font-medium text-white shadow-sm">
        前门
      </div>
      <div class="min-h-8 flex-1 border-l border-dashed border-stone-300" />
      <div class="rounded-lg border border-stone-300 bg-white px-3 py-4 text-center text-sm font-medium text-stone-800 shadow-sm">
        后门
      </div>
    </div>

    <div
      class="grid min-w-max flex-1 gap-3"
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

    <div
      v-if="doorSide === 'right'"
      class="flex min-w-20 flex-col justify-between gap-3 py-1"
    >
      <div class="rounded-lg border border-stone-300 bg-stone-950 px-3 py-4 text-center text-sm font-medium text-white shadow-sm">
        前门
      </div>
      <div class="min-h-8 flex-1 border-l border-dashed border-stone-300" />
      <div class="rounded-lg border border-stone-300 bg-white px-3 py-4 text-center text-sm font-medium text-stone-800 shadow-sm">
        后门
      </div>
    </div>
  </div>
</template>
