<script setup lang="ts">
import { computed } from "vue";
import type { DoorSide, Seat } from "../types/seat";

const props = defineProps<{
  rows: number;
  columns: number;
  doorSide: DoorSide;
  aisleAfterColumns: number[];
  seats: Seat[];
}>();

function seatKey(row: number, column: number) {
  return `${row}:${column}`;
}

const seatMap = computed(() => new Map(props.seats.map((seat) => [seatKey(seat.row, seat.column), seat])));

const validAisleAfterColumns = computed(() =>
  [...new Set(props.aisleAfterColumns)]
    .filter((column) => column >= 0 && column < props.columns - 1)
    .sort((a, b) => a - b)
);

const aisleColumnSet = computed(() => new Set(validAisleAfterColumns.value));

const gridTemplateColumns = computed(() => {
  const tracks: string[] = [];

  for (let column = 0; column < props.columns; column += 1) {
    tracks.push("minmax(8rem, 1fr)");

    if (aisleColumnSet.value.has(column)) {
      tracks.push("minmax(2rem, 2.5rem)");
    }
  }

  return tracks.join(" ");
});

const seatCells = computed(() =>
  Array.from({ length: props.rows * props.columns }, (_, index) => {
    const row = Math.floor(index / props.columns);
    const column = index % props.columns;

    return {
      key: seatKey(row, column),
      row,
      column,
      gridColumn: seatGridColumn(column)
    };
  })
);

function seatGridColumn(column: number) {
  return column + 1 + validAisleAfterColumns.value.filter((aisleColumn) => aisleColumn < column).length;
}

function aisleGridColumn(column: number) {
  return column + 2 + validAisleAfterColumns.value.filter((aisleColumn) => aisleColumn < column).length;
}
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
      :style="{ gridTemplateColumns }"
    >
      <div
        v-for="column in validAisleAfterColumns"
        :key="`aisle:${column}`"
        class="pointer-events-none flex min-h-full items-center justify-center border-x border-dashed border-stone-400 text-sm font-medium text-stone-500"
        :style="{ gridColumn: aisleGridColumn(column), gridRow: `1 / span ${rows}` }"
      >
        <span class="vertical-rl tracking-normal">过道</span>
      </div>
      <div
        v-for="cell in seatCells"
        :key="cell.key"
        class="min-h-20 rounded-lg border border-stone-200 bg-white px-4 py-3 shadow-sm"
        :style="{ gridColumn: cell.gridColumn, gridRow: cell.row + 1 }"
      >
        <template v-if="seatMap.get(cell.key)">
          <div class="truncate text-base font-medium text-stone-950">
            {{
              seatMap.get(cell.key)?.name || "空座"
            }}
          </div>
          <div class="mt-1 truncate text-sm text-stone-500">
            {{
              seatMap.get(cell.key)?.studentNo || "未填写学号"
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
