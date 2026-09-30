import assert from "node:assert/strict";
import { test } from "node:test";
import { swapSeatLines } from "../src/utils/seatSwap.ts";

function makeSeats() {
  return [
    { row: 0, column: 0, name: "A", studentNo: "1" },
    { row: 0, column: 1, name: null, studentNo: null },
    { row: 0, column: 2, name: "C", studentNo: "3" },
    { row: 1, column: 0, name: "D", studentNo: "4" },
    { row: 1, column: 1, name: "E", studentNo: "5" },
    { row: 1, column: 2, name: null, studentNo: null },
    { row: 2, column: 0, name: "G", studentNo: "7" },
    { row: 2, column: 1, name: "H", studentNo: "8" },
    { row: 2, column: 2, name: "I", studentNo: "9" }
  ];
}

test("whole-row swap moves names, student numbers, and empty seats without shifting middle row", () => {
  const seats = makeSeats();
  const middle = seats.slice(3, 6).map(({ name, studentNo }) => [name, studentNo]);
  swapSeatLines(seats, "row", 0, 2);
  assert.deepEqual(seats.slice(0, 3).map(({ name, studentNo }) => [name, studentNo]), [["G", "7"], ["H", "8"], ["I", "9"]]);
  assert.deepEqual(seats.slice(3, 6).map(({ name, studentNo }) => [name, studentNo]), middle);
  assert.deepEqual(seats.slice(6).map(({ name, studentNo }) => [name, studentNo]), [["A", "1"], [null, null], ["C", "3"]]);
});

test("whole-column swap preserves positions, handles empty seats, and is reversible", () => {
  const seats = makeSeats();
  const original = structuredClone(seats);
  swapSeatLines(seats, "column", 0, 2);
  assert.deepEqual(seats.filter((seat) => seat.column === 0).map(({ name, studentNo }) => [name, studentNo]), [["C", "3"], [null, null], ["I", "9"]]);
  assert.deepEqual(seats.filter((seat) => seat.column === 1), original.filter((seat) => seat.column === 1));
  swapSeatLines(seats, "column", 0, 2);
  assert.deepEqual(seats, original);
});
