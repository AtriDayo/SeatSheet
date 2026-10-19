<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { Printer, X } from "@lucide/vue";
import type { EditableSeatPlan } from "../types/seat";
import { teacherPrintLayout } from "../utils/seatPrint";
import "../seat-print.css";

const props = defineProps<{ plan: EditableSeatPlan; draft: boolean }>();
const emit = defineEmits<{ close: [] }>();
const layout = computed(() => teacherPrintLayout(props.plan));
const occupied = computed(() => props.plan.seats.filter((seat) => seat.name || seat.studentNo).length);
const stage = ref<HTMLElement | null>(null);
const paper = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
const dialog = ref<HTMLElement | null>(null);
const scale = ref(1);
const guides = ref(true);
const printing = ref(false);
const printError = ref("");
const tinyText = ref(false);
const rowGap = computed(() => Math.min(2, 8 / props.plan.rows));
const oldFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
const oldOverflow = document.body.style.overflow;
let observer: ResizeObserver | undefined;
let disposed = false;

function resizePreview() {
  if (!stage.value || !paper.value) return;
  scale.value = Math.min(1, stage.value.clientWidth / paper.value.offsetWidth);
}

function fitSeatText() {
  if (!paper.value) return;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return;
  let smallest = 18;
  for (const cell of paper.value.querySelectorAll<HTMLElement>(".seat-print-cell")) {
    const name = cell.querySelector<HTMLElement>(".seat-print-name");
    const number = cell.querySelector<HTMLElement>(".seat-print-number");
    if (!name) continue;
    const padding = Math.min(5, cell.clientWidth * .08, cell.clientHeight * .08);
    const width = Math.max(1, cell.clientWidth - padding * 2);
    const height = Math.max(1, cell.clientHeight - padding * 2);
    context.font = '100px "Microsoft YaHei", "Noto Sans SC", sans-serif';
    const nameWidth = context.measureText(name.textContent || "空座").width / 100;
    let font = Math.min(24, width / Math.max(.1, nameWidth), height / (number ? 2.2 : 1.25));
    font = Math.max(.1, font);
    name.style.fontSize = `${font}px`;
    smallest = Math.min(smallest, font * .75);
    if (number) {
      const numberWidth = context.measureText(number.textContent || "—").width / 100;
      number.style.fontSize = `${Math.min(14, font * .72, width / Math.max(.1, numberWidth))}px`;
    }
  }
  tinyText.value = smallest < 9;
}

async function printSeats() {
  printing.value = true;
  printError.value = "";
  try {
    await document.fonts.ready;
    if (disposed) return;
    fitSeatText();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (!disposed) window.print();
  } catch {
    printError.value = "无法打开打印窗口，请使用浏览器的打印功能重试。";
  } finally {
    printing.value = false;
  }
}

function keydown(event: KeyboardEvent) {
  if (event.key === "Escape") { event.preventDefault(); emit("close"); }
  if (event.key !== "Tab" || !dialog.value) return;
  const controls = [...dialog.value.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)")];
  const first = controls[0], last = controls[controls.length - 1];
  if (!dialog.value.contains(document.activeElement)) { event.preventDefault(); first?.focus(); return; }
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}

onMounted(async () => {
  document.body.classList.add("seat-print-open");
  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", keydown);
  window.addEventListener("beforeprint", fitSeatText);
  observer = new ResizeObserver(resizePreview);
  if (stage.value) observer.observe(stage.value);
  await nextTick();
  resizePreview(); fitSeatText(); closeButton.value?.focus();
  await document.fonts.ready;
  if (!disposed) fitSeatText();
});
onBeforeUnmount(() => {
  disposed = true;
  observer?.disconnect();
  document.removeEventListener("keydown", keydown);
  window.removeEventListener("beforeprint", fitSeatText);
  document.body.classList.remove("seat-print-open");
  document.body.style.overflow = oldOverflow;
  oldFocus?.focus();
});
</script>

<template>
  <Teleport to="body">
    <div class="seat-print-overlay" @click.self="emit('close')">
      <section ref="dialog" class="seat-print-dialog" role="dialog" aria-modal="true" aria-labelledby="seat-print-title">
        <header class="seat-print-toolbar">
          <div><h2 id="seat-print-title">打印座位表</h2><p>讲台视角 · A4 横向 · 白底 · 四边留白 2 cm</p></div>
          <button ref="closeButton" type="button" class="workspace-btn" aria-label="关闭打印预览" @click="emit('close')"><X :size="18" aria-hidden="true" /></button>
        </header>
        <div class="seat-print-options">
          <label><input v-model="guides" type="checkbox" />显示安全边界（不打印）</label>
          <span v-if="draft" class="seat-print-draft">当前编辑内容含未保存修改；打印不会保存</span>
        </div>
        <div class="seat-print-preview">
          <div ref="stage" class="seat-print-stage" :style="{ height: `${210 * 96 / 25.4 * scale}px` }">
            <article ref="paper" class="seat-print-paper" :class="{ 'has-guides': guides }" :style="{ transform: `scale(${scale})` }" aria-label="讲台视角座位表打印内容">
              <div class="seat-print-layout">
                <header class="seat-print-heading">
                  <h1 :style="{ fontSize: plan.name.length > 36 ? '13pt' : '20pt' }">{{ plan.name || '座位表' }} · 座位表</h1>
                  <p>{{ plan.rows }} 排 × {{ plan.columns }} 列 · {{ occupied }} 人</p>
                </header>
                <div class="seat-print-rear">教室后方</div>
                <div class="seat-print-classroom" :class="`door-${layout.doorSide}`">
                  <aside class="seat-print-doors" aria-label="教室门"><span>后门</span><span>前门</span></aside>
                  <div class="seat-print-grid" :style="{ gridTemplateColumns: layout.gridTemplateColumns, gridTemplateRows: `repeat(${plan.rows}, minmax(0, 1fr))`, gap: `${rowGap}mm`, '--print-aisle-width': `${Math.min(3, 18 / plan.columns)}mm` }">
                    <div v-for="track in layout.aisleTracks" :key="`aisle-${track}`" class="seat-print-aisle" :style="{ gridColumn: track, gridRow: `1 / span ${plan.rows}` }" aria-label="过道" />
                    <div v-for="seat in layout.cells" :key="`${seat.row}:${seat.column}`" class="seat-print-cell" :data-seat="`${seat.row}:${seat.column}`" :style="{ gridColumn: seat.gridColumn, gridRow: seat.displayRow + 1 }">
                      <div class="seat-print-name">{{ seat.name || '空座' }}</div>
                      <div v-if="plan.showStudentNo && (seat.name || seat.studentNo)" class="seat-print-number">{{ seat.studentNo || '—' }}</div>
                    </div>
                  </div>
                </div>
                <div class="seat-print-platform">讲台 · 教师站位</div>
              </div>
            </article>
          </div>
        </div>
        <footer class="seat-print-actions">
          <div><p>打印窗口中请保持 A4、横向和 100% 缩放，并关闭页眉页脚。</p><p v-if="tinyText" class="seat-print-draft">当前布局较密，文字已缩小以适应一张 A4。</p><p v-if="printError" role="alert">{{ printError }}</p></div>
          <button class="workspace-btn workspace-btn--primary" type="button" :disabled="printing" @click="printSeats"><Printer :size="16" aria-hidden="true" />{{ printing ? '正在打开…' : '打印 / 保存 PDF' }}</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
