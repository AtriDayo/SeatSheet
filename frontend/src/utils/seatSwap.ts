import type { Seat } from "../types/seat";

export function swapSeatLines(seats: Seat[], axis: "row" | "column", source: number, target: number) {
  if (source === target) return;

  const otherAxis = axis === "row" ? "column" : "row";
  const sourceSeats = new Map(seats.filter((seat) => seat[axis] === source).map((seat) => [seat[otherAxis], seat]));
  const targetSeats = new Map(seats.filter((seat) => seat[axis] === target).map((seat) => [seat[otherAxis], seat]));

  for (const [position, sourceSeat] of sourceSeats) {
    const targetSeat = targetSeats.get(position);
    if (!targetSeat) continue;
    const { name, studentNo } = sourceSeat;
    sourceSeat.name = targetSeat.name;
    sourceSeat.studentNo = targetSeat.studentNo;
    targetSeat.name = name;
    targetSeat.studentNo = studentNo;
  }
}
