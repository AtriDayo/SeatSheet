import type { EditableSeatPlan } from "../types/seat";

type PrintPlan = Pick<EditableSeatPlan, "rows" | "columns" | "doorSide" | "aisleAfterColumns" | "seats">;

/** Reverse positions, never the text. Aisles and doors must follow the same rotation. */
export function teacherPrintLayout(plan: PrintPlan) {
  const aisles = [...new Set(plan.aisleAfterColumns)]
    .filter((column) => Number.isInteger(column) && column >= 0 && column < plan.columns - 1)
    .map((column) => plan.columns - 2 - column)
    .sort((a, b) => a - b);
  const aisleSet = new Set(aisles);
  const tracks: string[] = [];
  const seatTracks: number[] = [];
  const aisleTracks: number[] = [];
  for (let column = 0; column < plan.columns; column += 1) {
    seatTracks.push(tracks.length + 1);
    tracks.push("minmax(0, 1fr)");
    if (aisleSet.has(column)) {
      aisleTracks.push(tracks.length + 1);
      tracks.push("var(--print-aisle-width)");
    }
  }
  const seatMap = new Map(plan.seats.map((seat) => [`${seat.row}:${seat.column}`, seat]));
  const cells = Array.from({ length: plan.rows * plan.columns }, (_, index) => {
    const displayRow = Math.floor(index / plan.columns);
    const displayColumn = index % plan.columns;
    const row = plan.rows - 1 - displayRow;
    const column = plan.columns - 1 - displayColumn;
    const seat = seatMap.get(`${row}:${column}`);
    return { row, column, displayRow, displayColumn, gridColumn: seatTracks[displayColumn],
      name: seat?.name ?? "", studentNo: seat?.studentNo ?? "" };
  });
  return { cells, aisleTracks, gridTemplateColumns: tracks.join(" "),
    doorSide: plan.doorSide === "right" ? "left" : "right" };
}
