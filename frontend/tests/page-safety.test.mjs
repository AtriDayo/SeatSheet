import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";
import { parse } from "@vue/compiler-sfc";
import * as vue from "vue";
import * as rotation from "../src/utils/rotation.ts";
import { parseImportedSeatPlan } from "../src/utils/seatImport.ts";

// Exercise the actual setup script without mounting a browser or changing production data.
async function pageSetup(page, fetchSeatPlan, saveSeatPlan) {
  const source = await readFile(new URL(`../src/pages/${page}.vue`, import.meta.url), "utf8");
  const script = parse(source).descriptor.scriptSetup.content;
  const ast = ts.createSourceFile(`${page}.ts`, script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const body = ast.statements.filter((node) => !ts.isImportDeclaration(node)).map((node) => node.getFullText(ast)).join("\n");
  const listeners = new Map();
  const cleanup = [];
  const deps = { computed: vue.computed, nextTick: vue.nextTick, reactive: vue.reactive, ref: vue.ref, watch: vue.watch,
    ...rotation, parseImportedSeatPlan, onMounted: () => {}, onUnmounted: (fn) => cleanup.push(fn), onBeforeRouteLeave: () => {},
    fetchSeatPlan, saveSeatPlan, verifyAdminPassword: async () => {},
    useAdminSession: () => ({ adminPassword: vue.ref("local-only"), authenticated: vue.ref(true), setAdminPassword: () => {}, clearAdminSession: () => {} }),
    window: { confirm: () => true, addEventListener: (type, fn) => listeners.set(type, fn),
      removeEventListener: (type, fn) => { if (listeners.get(type) === fn) listeners.delete(type); } } };
  const exposed = page === "ConfigPage" ? "form, draftRows, draftColumns, applyDimensions, submit, isDirty, importJson" :
    "form, saveRules, executeRotation, undoRotation, needsReview, invalidRules, previewFrames, playPreview, playingPreview, buildGroupCyclePreviewUnits";
  const js = ts.transpileModule(`${body}\nreturn { loadPlan, planLoaded, error, ${exposed} };`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return { ...new Function(...Object.keys(deps), js)(...Object.values(deps)), listeners, unmount: () => cleanup.forEach((fn) => fn()) };
}

const fixture = () => ({ id: "test", updatedAt: "2026-09-29T00:00:00.000Z", name: "local regression", rows: 6, columns: 8,
  doorSide: "right", aisleAfterColumns: [0, 2, 4, 6], showStudentNo: false,
  rotationConfig: { rules: [{ id: "invalid", type: "groupSwap", sourceGroupIndex: 0, targetGroupIndex: 1 }] },
  seats: Array.from({ length: 48 }, (_, i) => ({ row: Math.floor(i / 8), column: i % 8, name: i === 40 || i === 47 ? null : `test-${i}`, studentNo: null })) });

test("failed plan loads never submit empty fallback plans", async () => {
  let writes = 0;
  const fail = async () => { throw new Error("local test: unavailable"); };
  const write = async () => { writes++; return fixture(); };
  for (const page of ["ConfigPage", "RotatePage"]) {
    const setup = await pageSetup(page, fail, write);
    await setup.loadPlan();
    assert.equal(setup.planLoaded.value, false);
    if (page === "ConfigPage") await setup.submit();
    else { await setup.saveRules(); await setup.executeRotation(); await setup.undoRotation(); }
  }
  assert.equal(writes, 0);
});

test("dimension drafts and shrink/restore preserve all names and empty seats", async () => {
  const setup = await pageSetup("ConfigPage", async () => fixture(), async () => fixture());
  await setup.loadPlan();
  const original = JSON.stringify(setup.form.seats);
  setup.draftRows.value = "";
  await vue.nextTick();
  assert.equal(setup.applyDimensions(), false);
  assert.equal(JSON.stringify(setup.form.seats), original);
  setup.draftRows.value = 6;
  assert.equal(setup.isDirty.value, false);
  setup.draftRows.value = 5;
  assert.equal(setup.applyDimensions(), true);
  await vue.nextTick();
  assert.equal(setup.form.seats.length, 40);
  setup.draftRows.value = 6;
  assert.equal(setup.applyDimensions(), true);
  await vue.nextTick();
  assert.equal(JSON.stringify(setup.form.seats), original);
});

test("invalid layout references stay visible and cannot execute or disappear silently", async () => {
  let writes = 0;
  const setup = await pageSetup("RotatePage", async () => fixture(), async () => { writes++; return fixture(); });
  await setup.loadPlan();
  assert.equal(setup.form.rotationConfig.rules.length, 1);
  assert.equal(setup.invalidRules.value.length, 1);
  assert.equal(setup.needsReview.value, true);
  assert.equal(setup.previewFrames.value.length, 1);
  await setup.saveRules();
  await setup.executeRotation();
  assert.equal(writes, 0);
});

test("imports are atomic and reject corrupt seats or rules without touching drafts", async () => {
  const setup = await pageSetup("ConfigPage", async () => fixture(), async () => fixture());
  await setup.loadPlan();
  setup.draftRows.value = 5;
  const before = JSON.stringify(setup.form);
  for (const payload of [null, [], { ...fixture(), name: "wrong draft", rows: 1, seats: [null] },
    { ...fixture(), seats: [fixture().seats[0], fixture().seats[0]] },
    { ...fixture(), rotationConfig: { rules: [{ id: "bad", type: "groupCycle", groupIndex: 0, direction: "forward", steps: 1.5 }] } }]) {
    await setup.importJson({ target: { value: "file", files: [{ text: async () => JSON.stringify(payload) }] } });
    assert.ok(setup.error.value);
    assert.equal(JSON.stringify(setup.form), before);
    assert.equal(setup.draftRows.value, 5);
  }
  await setup.importJson({ target: { value: "file", files: [{ text: async () => JSON.stringify(fixture()) }] } });
  assert.equal(setup.error.value, "");
  assert.equal(setup.form.seats.length, 48);
  assert.equal(setup.form.seats.filter((seat) => !seat.name).length, 2);
  assert.equal(setup.draftRows.value, 6);
});

test("bad steps cannot crash preview or execute; single and odd-column preview matches results", async () => {
  let writes = 0;
  const setup = await pageSetup("RotatePage", async () => ({ ...fixture(), rotationConfig: { rules: [] } }), async () => { writes++; return fixture(); });
  await setup.loadPlan();
  const rule = { id: "cycle", type: "groupCycle", groupIndex: 0, direction: "forward", steps: 1 };
  setup.form.rotationConfig.rules = [rule];
  for (const steps of [1.5, "", 0, -1, NaN, Infinity, 201]) {
    setup.form.rotationConfig.rules[0].steps = steps;
    assert.equal(setup.invalidRules.value.length, 1);
    assert.equal(setup.previewFrames.value.length, 1);
    setup.playPreview();
    assert.equal(setup.playingPreview.value, false);
    await setup.executeRotation();
  }
  assert.equal(writes, 0);
  for (const aisles of [[0, 2, 4, 6], [2, 5], [3]]) {
    setup.form.aisleAfterColumns = aisles;
    setup.form.rotationConfig.rules[0].steps = 1;
    const currentRule = setup.form.rotationConfig.rules[0];
    const units = setup.buildGroupCyclePreviewUnits(setup.form.seats, setup.form.seats, currentRule);
    for (const unit of units.filter((unit) => unit.target)) {
      assert.equal(unit.target.column, unit.column);
      assert.equal(unit.target.row, (unit.row + 1) % setup.form.rows);
    }
    const final = rotation.applyRotationRule(setup.form.seats, rotation.deriveSeatGroups(8, aisles), currentRule);
    assert.equal(new Set(units.map((unit) => unit.key)).size, units.length);
    for (const unit of units) for (const [offset, seat] of unit.seats.entries()) {
      const target = unit.target ?? unit;
      assert.equal(final.find((item) => item.row === target.row && item.column === target.column + offset).name, seat.name);
    }
  }
});

test("refresh/close warnings only attach for unsaved changes and are removed on save/unmount", async () => {
  for (const page of ["ConfigPage", "RotatePage"]) {
    const plan = { ...fixture(), rotationConfig: { rules: [] } };
    const setup = await pageSetup(page, async () => plan, async (payload) => ({ ...payload, updatedAt: "2026-09-29T00:00:01.000Z" }));
    await setup.loadPlan();
    assert.equal(setup.listeners.has("beforeunload"), false);
    if (page === "ConfigPage") setup.form.seats[0].name = "changed locally";
    else setup.form.rotationConfig.rules.push({ id: "cycle", type: "groupCycle", groupIndex: 0, steps: 1, direction: "forward" });
    assert.equal(setup.listeners.has("beforeunload"), true);
    let prevented = false;
    const event = { returnValue: undefined, preventDefault: () => { prevented = true; } };
    setup.listeners.get("beforeunload")(event);
    assert.equal(prevented, true);
    assert.equal(event.returnValue, "");
    if (page === "ConfigPage") await setup.submit(); else await setup.saveRules();
    assert.equal(setup.listeners.has("beforeunload"), false);
    if (page === "ConfigPage") setup.draftRows.value = "";
    else setup.form.rotationConfig.rules.push({ id: "cycle2", type: "groupCycle", groupIndex: 1, steps: 1, direction: "forward" });
    assert.equal(setup.listeners.has("beforeunload"), true);
    setup.unmount();
    assert.equal(setup.listeners.has("beforeunload"), false);
  }
});
