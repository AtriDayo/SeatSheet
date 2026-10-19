import assert from "node:assert/strict";
import { test } from "node:test";
import { teacherPrintLayout } from "../src/utils/seatPrint.ts";

function plan(rows = 3, columns = 5) {
  return { rows, columns, doorSide: "right", aisleAfterColumns: [0, 2],
    seats: Array.from({ length: rows * columns }, (_, index) => ({
      row: Math.floor(index / columns), column: index % columns,
      name: `学生${index}`, studentNo: String(index + 1)
    })) };
}

test("teacher view reverses both coordinates without changing names or student numbers", () => {
  const source = plan();
  const before = structuredClone(source);
  const result = teacherPrintLayout(source);
  assert.equal(result.cells[0].name, "学生14");
  assert.equal(result.cells[4].name, "学生10");
  assert.equal(result.cells[10].name, "学生4");
  assert.equal(result.cells[14].name, "学生0");
  assert.equal(result.cells[14].studentNo, "1");
  assert.equal(result.cells[14].displayRow, 2);
  assert.deepEqual(source, before);
});

test("asymmetric aisles and either door side follow the teacher rotation", () => {
  const source = plan();
  const result = teacherPrintLayout(source);
  // Source gaps after columns 0 and 2 become display gaps after columns 3 and 1.
  assert.deepEqual(result.aisleTracks, [3, 6]);
  assert.deepEqual(result.cells.slice(0, 5).map((seat) => seat.gridColumn), [1, 2, 4, 5, 7]);
  assert.equal(result.doorSide, "left");
  assert.equal(teacherPrintLayout({ ...source, doorSide: "left" }).doorSide, "right");
});

test("missing seats remain empty and invalid or duplicate aisles do not create extra tracks", () => {
  const source = plan(1, 1);
  source.seats = [];
  source.aisleAfterColumns = [-1, 0, 0, 1, 1.5];
  const result = teacherPrintLayout(source);
  assert.equal(result.cells.length, 1);
  assert.equal(result.cells[0].name, "");
  assert.equal(result.cells[0].studentNo, "");
  assert.deepEqual(result.aisleTracks, []);
});
