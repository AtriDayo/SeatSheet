import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveSeatGroups, deskPairColumnsForGroup } from "../src/utils/rotation.ts";

const pairsFor = (columns, aisles) =>
  deriveSeatGroups(columns, aisles).flatMap(deskPairColumnsForGroup);

test("pairs start within each aisle-delimited group, not at global even columns", () => {
  assert.deepEqual(pairsFor(8, [0, 2, 4, 6]), [[1, 2], [3, 4], [5, 6]]);
});

test("standard paired layout retains all desk handles", () => {
  assert.deepEqual(pairsFor(8, [1, 3, 5]), [[0, 1], [2, 3], [4, 5], [6, 7]]);
});

test("single columns and odd trailing columns never pair across an aisle", () => {
  assert.deepEqual(pairsFor(8, [0, 3, 4, 6]), [[1, 2], [5, 6]]);
  assert.deepEqual(pairsFor(4, [0, 1, 2]), []);
});
