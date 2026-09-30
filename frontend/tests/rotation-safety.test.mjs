import assert from "node:assert/strict";
import { test } from "node:test";
import { applyRotationRule, cycleColumnsForGroup, deriveSeatGroups } from "../src/utils/rotation.ts";
import { parseImportedSeatPlan } from "../src/utils/seatImport.ts";
import { readFile } from "node:fs/promises";

const grid = (rows, columns) => Array.from({ length: rows * columns }, (_, i) => ({
  id: `seat-${i}`,
  row: Math.floor(i / columns), column: i % columns,
  name: i % 5 === 0 ? null : `test-${i}`, studentNo: i % 5 === 0 ? null : `${i}`
}));
const contents = (seats) => seats.map(({ name, studentNo }) => JSON.stringify([name, studentNo])).sort();

test("single-column cycle moves empty desks and reverses exactly", () => {
  const seats = grid(6, 1), groups = deriveSeatGroups(1, []);
  assert.deepEqual(cycleColumnsForGroup(groups[0]), [[0]]);
  const rule = { id: "single", type: "groupCycle", groupIndex: 0, direction: "forward", steps: 1 };
  const rotated = applyRotationRule(seats, groups, rule);
  for (let row = 0; row < 6; row++) assert.equal(rotated[(row + 1) % 6].name, seats[row].name);
  assert.deepEqual(applyRotationRule(rotated, groups, { ...rule, direction: "backward" }), seats);
});

test("paired and odd-width cycles preserve every payload and keep desk partners together", () => {
  for (let columns = 1; columns <= 8; columns++) for (let rows = 1; rows <= 6; rows++) {
    const seats = grid(rows, columns), groups = deriveSeatGroups(columns, []);
    for (const steps of [1, 2, 7, 200]) {
      const rule = { id: "cycle", type: "groupCycle", groupIndex: 0, direction: "forward", steps };
      const result = applyRotationRule(seats, groups, rule);
      assert.deepEqual(contents(result), contents(seats));
      for (const seat of seats) {
        const targetRow = (seat.row + steps) % rows;
        const target = result[targetRow * columns + seat.column];
        assert.equal(target.name, seat.name);
        assert.equal(target.studentNo, seat.studentNo);
      }
      assert.deepEqual(applyRotationRule(result, groups, { ...rule, direction: "backward" }), seats);
      const sourcePairs = [];
      for (let row = 0; row < rows; row++) for (let col = 0; col + 1 < columns; col += 2) {
        sourcePairs.push(JSON.stringify(contents(seats.slice(row * columns + col, row * columns + col + 2))));
      }
      const targetPairs = [];
      for (let row = 0; row < rows; row++) for (let col = 0; col + 1 < columns; col += 2) {
        targetPairs.push(JSON.stringify(contents(result.slice(row * columns + col, row * columns + col + 2))));
      }
      assert.deepEqual(targetPairs.sort(), sourcePairs.sort());
    }
  }
});

test("three- and four-column groups shift entire rows, never left-to-right", () => {
  for (const columns of [3, 4]) {
    const seats = grid(2, columns);
    seats.forEach((seat, index) => { seat.name = String.fromCharCode(65 + index); });
    const result = applyRotationRule(seats, deriveSeatGroups(columns, []), {
      id: "row-shift", type: "groupCycle", groupIndex: 0, direction: "forward", steps: 1
    });
    assert.deepEqual(result.map((seat) => seat.name), columns === 3 ? ["D", "E", "F", "A", "B", "C"] : ["E", "F", "G", "H", "A", "B", "C", "D"]);
  }
});

test("only the chosen group's rows move, in either direction, including blanks", () => {
  const seats = grid(3, 8), groups = deriveSeatGroups(8, [3]);
  for (const direction of ["forward", "backward"]) {
    const result = applyRotationRule(seats, groups, { id: "right-group", type: "groupCycle", groupIndex: 1, direction, steps: 1 });
    for (const seat of seats) {
      const row = seat.column < 4 ? seat.row : (seat.row + (direction === "forward" ? 1 : 2)) % 3;
      assert.equal(result[row * 8 + seat.column].name, seat.name);
      assert.equal(result[row * 8 + seat.column].studentNo, seat.studentNo);
    }
  }
});

test("core cycle rejects temporary or fractional step values without crashing", () => {
  const seats = grid(6, 2), groups = deriveSeatGroups(2, []);
  for (const steps of [1.5, "", 0, -1, NaN, Infinity, 201]) {
    assert.deepEqual(applyRotationRule(seats, groups, { id: "bad", type: "groupCycle", groupIndex: 0, direction: "forward", steps }), seats);
  }
});

test("valid imports fill omitted blank cells but reject ambiguous or malformed data", () => {
  const valid = { rows: 2, columns: 2, seats: [{ row: 0, column: 0, name: "local", studentNo: null }] };
  assert.equal(parseImportedSeatPlan(JSON.stringify(valid)).seats.length, 4);
  for (const payload of [null, [], { ...valid, seats: undefined }, { ...valid, seats: [null] },
    { ...valid, seats: [valid.seats[0], valid.seats[0]] }, { ...valid, aisleAfterColumns: [1] },
    { ...valid, seats: [{ row: 2, column: 0 }] }, { ...valid, showStudentNo: "false" },
    { ...valid, rotationConfig: { rules: [null] } }]) assert.throws(() => parseImportedSeatPlan(JSON.stringify(payload)));
});

test("the supplied classroom file retains 48 desks, two blanks and all six rules", async (t) => {
  if (!process.env.SEATSHEET_TEST_FIXTURE) return t.skip("Provide SEATSHEET_TEST_FIXTURE to check the user's read-only classroom export.");
  const plan = parseImportedSeatPlan(await readFile(process.env.SEATSHEET_TEST_FIXTURE, "utf8"));
  assert.equal(plan.seats.length, 48);
  assert.equal(plan.seats.filter((seat) => !seat.name && !seat.studentNo).length, 2);
  assert.equal(plan.rotationConfig.rules.length, 6);
});
