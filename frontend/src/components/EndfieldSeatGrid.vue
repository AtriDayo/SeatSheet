<script setup lang="ts">
import { computed } from "vue";
import { ChevronUp, DoorOpen } from "@lucide/vue";
import type { DoorSide, Seat } from "../types/seat";
import { columnLabel } from "../utils/columnLabel";

const props = defineProps<{
  rows: number;
  columns: number;
  doorSide: DoorSide;
  aisleAfterColumns: number[];
  showStudentNo: boolean;
  seats: Seat[];
}>();
const aisles = computed(() => new Set(props.aisleAfterColumns.filter(i => i >= 0 && i < props.columns - 1)));
const columnTracks = computed(() => {
  let track = 2;
  return Array.from({ length: props.columns }, (_, index) => {
    const seatTrack = track++;
    const aisleTrack = aisles.value.has(index) ? track++ : null;
    return { index, seatTrack, aisleTrack };
  });
});
const template = computed(() => [
  "var(--row-width)",
  ...columnTracks.value.flatMap(col => col.aisleTrack
    ? ["minmax(var(--desk-width), 1fr)", "var(--aisle-width)"] : ["minmax(var(--desk-width), 1fr)"])
].join(" "));
const cells = computed(() => {
  const byPosition = new Map(props.seats.map(seat => [seat.row * props.columns + seat.column, seat]));
  return Array.from({ length: props.rows * props.columns }, (_, i) => ({
    row: Math.floor(i / props.columns), column: i % props.columns, seat: byPosition.get(i)
  }));
});
</script>

<template>
  <div class="floor-surface">
    <div class="platform"><span><ChevronUp :size="14" />教室前方</span></div>
    <div class="floor-scroll" tabindex="0" aria-label="教室座位图，可左右滚动">
      <div class="floor-room" :class="{ 'door-left': doorSide === 'left' }">
        <div class="floor-grid" :style="{ gridTemplateColumns: template }">
          <template v-for="col in columnTracks" :key="col.index">
            <span class="axis axis-column" :style="{ gridColumn: col.seatTrack, gridRow: 1 }">{{ columnLabel(col.index) }}</span>
            <div v-if="col.aisleTrack" class="floor-aisle" :style="{ gridColumn: col.aisleTrack, gridRow: `2 / span ${rows}` }"><span>过道</span></div>
          </template>
          <span v-for="row in rows" :key="row" class="axis axis-row" :style="{ gridColumn: 1, gridRow: row + 1 }">{{ String(row).padStart(2, "0") }}</span>
          <div v-for="cell in cells" :key="`${cell.row}-${cell.column}`" class="display-seat"
            :class="{ 'is-empty': !cell.seat?.name && !cell.seat?.studentNo }"
            :style="{ gridColumn: columnTracks[cell.column].seatTrack, gridRow: cell.row + 2 }">
            <strong :title="cell.seat?.name || undefined">{{ cell.seat?.name || (cell.seat?.studentNo ? '未填姓名' : '空座') }}</strong>
            <small v-if="showStudentNo && (cell.seat?.name || cell.seat?.studentNo)" :title="cell.seat?.studentNo || undefined">{{ cell.seat?.studentNo || '未填写学号' }}</small>
          </div>
        </div>
        <div class="floor-doors"><span><DoorOpen :size="15" />前门</span><i /><span><DoorOpen :size="15" />后门</span></div>
      </div>
    </div>
  </div>
</template>
