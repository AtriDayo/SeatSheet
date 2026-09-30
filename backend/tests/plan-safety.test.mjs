import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

test("local database: revision, rule-only saves, layout review and one-step undo", async () => {
  assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/[^@]+@127\.0\.0\.1:55433\/seatsheet_regression\?schema=public$/,
    "This destructive regression suite only runs against the dedicated disposable regression database, never the user's preview database.");
  const { registerRoutes } = await import("../dist/routes.js");
  const { prisma } = await import("../dist/prisma.js");
  const { buildRotationFrames, deriveSeatGroups } = await import("../../frontend/src/utils/rotation.ts");
  const app = Fastify();
  await app.register(sensible);
  await registerRoutes(app);
  const get = async () => (await app.inject({ method: "GET", url: "/api/seat-plan" })).json();
  const put = (plan, operation = "edit", overrides = {}) => app.inject({ method: "PUT", url: "/api/seat-plan",
    headers: { "x-admin-password": process.env.ADMIN_PASSWORD },
    payload: { ...plan, expectedUpdatedAt: plan.updatedAt, operation, ...overrides } });
  const state = (plan) => plan.seats.map(({ row, column, name, studentNo }) => ({ row, column, name, studentNo }));
  await prisma.seatPlan.deleteMany();
  const run = promisify(execFile);
  const serviceUrl = new URL("../dist/seatPlanService.js", import.meta.url).href;
  const prismaUrl = new URL("../dist/prisma.js", import.meta.url).href;
  const childScript = `const { getActivePlan } = await import(${JSON.stringify(serviceUrl)}); const { prisma } = await import(${JSON.stringify(prismaUrl)}); try { console.log((await getActivePlan()).id); } finally { await prisma.$disconnect(); }`;
  const firstLoads = await Promise.all([
    ...Array.from({ length: 8 }, () => get().then((plan) => plan.id)),
    ...Array.from({ length: 4 }, () => run(process.execPath, ["--input-type=module", "-e", childScript]).then(({ stdout }) => stdout.trim()))
  ]);
  assert.equal(new Set(firstLoads).size, 1);
  assert.equal(await prisma.seatPlan.count({ where: { isActive: true } }), 1);
  assert.equal(await prisma.seat.count(), 30);
  const original = await get();
  try {
    const fixture = JSON.parse(await readFile(process.env.SEATSHEET_TEST_FIXTURE, "utf8"));
    let result = await put(original, "edit", fixture);
    assert.equal(result.statusCode, 200);
    let plan = result.json();
    const validRules = fixture.rotationConfig.rules.filter((rule) => !(rule.type === "groupSwap" && rule.sourceGroupIndex === 0));
    result = await put(plan, "rules", { rotationConfig: { rules: validRules } });
    assert.equal(result.statusCode, 200);
    plan = result.json();

    // Rule-only writes must ignore client names and layout, even at the correct revision.
    result = await put(plan, "rules", { name: "must not replace classroom", rows: 1, columns: 1, aisleAfterColumns: [], seats: [] });
    assert.equal(result.statusCode, 200);
    let saved = result.json();
    assert.equal(saved.name, plan.name);
    assert.deepEqual(state(saved), state(plan));
    assert.equal(saved.rows, 6);
    const stale = plan;
    plan = saved;
    for (const operation of ["edit", "rules", "rotate", "undo"]) {
      result = await put(stale, operation);
      assert.equal(result.statusCode, 409, operation);
      assert.equal((await get()).updatedAt, plan.updatedAt);
    }

    // Missing revision must never be accepted, including an old frontend's empty default plan.
    const noRevision = await app.inject({ method: "PUT", url: "/api/seat-plan",
      headers: { "x-admin-password": process.env.ADMIN_PASSWORD }, payload: fixture });
    assert.equal(noRevision.statusCode, 400);

    const before = state(plan);
    for (const steps of [1.5, 0, -1, 201, ""]) {
      const badRules = { rules: [{ id: "bad-step", type: "groupCycle", groupIndex: 0, direction: "forward", steps }] };
      assert.equal((await put(plan, "rules", { rotationConfig: badRules })).statusCode, 400);
      assert.equal((await put(plan, "rotate", { rotationConfig: badRules })).statusCode, 400);
      assert.equal((await get()).updatedAt, plan.updatedAt);
    }
    assert.equal((await put(plan, "rotate", { seats: [] })).statusCode, 409);
    assert.equal((await put(plan, "rules", { rotationConfig: fixture.rotationConfig })).statusCode, 409);
    assert.equal((await get()).updatedAt, plan.updatedAt);
    const frames = buildRotationFrames(plan.seats, deriveSeatGroups(plan.columns, plan.aisleAfterColumns), plan.rotationConfig);
    result = await put(plan, "rotate", { seats: frames.at(-1).seats });
    assert.equal(result.statusCode, 200);
    saved = result.json();
    assert.ok(saved.rotationConfig.undo);
    assert.equal(saved.seats.filter((seat) => !seat.name && !seat.studentNo).length, 2);
    assert.notDeepEqual(state(saved), before);
    // Undo survives refresh and rule edits, and uses the actual prior result rather than new rules.
    assert.ok((await get()).rotationConfig.undo);
    result = await put(saved, "rules", { rotationConfig: { rules: [] } });
    assert.equal(result.statusCode, 200);
    saved = result.json();
    result = await put(saved, "undo");
    assert.equal(result.statusCode, 200);
    plan = result.json();
    assert.deepEqual(state(plan), before);
    assert.equal(plan.rotationConfig.undo, null);
    assert.equal((await put(plan, "undo")).statusCode, 409);

    result = await put(plan, "rules", { rotationConfig: { rules: validRules } });
    assert.equal(result.statusCode, 200);
    plan = result.json();

    result = await put(plan, "edit", { aisleAfterColumns: [1, 3, 5] });
    assert.equal(result.statusCode, 200);
    plan = result.json();
    assert.equal(plan.rotationConfig.reviewRequired, true);
    assert.deepEqual(plan.rotationConfig.rules, validRules);
    assert.equal((await put(plan, "rotate")).statusCode, 409);
    assert.equal((await get()).rotationConfig.reviewRequired, true);
    result = await put(plan, "rules");
    assert.equal(result.statusCode, 200);
    plan = result.json();
    assert.equal(plan.rotationConfig.reviewRequired, false);

    const currentFrames = buildRotationFrames(plan.seats, deriveSeatGroups(plan.columns, plan.aisleAfterColumns), plan.rotationConfig);
    result = await put(plan, "rotate", { seats: currentFrames.at(-1).seats });
    assert.equal(result.statusCode, 200);
    plan = result.json();
    result = await put(plan, "edit", { seats: plan.seats.map((seat, i) => i ? seat : { ...seat, name: "local regression only" }) });
    assert.equal(result.statusCode, 200);
    plan = result.json();
    assert.equal(plan.rotationConfig.undo, null);
    assert.equal((await put(plan, "undo")).statusCode, 409);

    // Competing writers must serialize with exactly one winner.
    const concurrent = await Promise.all([put(plan), put(plan)]);
    assert.deepEqual(concurrent.map((response) => response.statusCode).sort(), [200, 409]);
  } finally {
    const current = await get();
    assert.equal((await put(current, "edit", original)).statusCode, 200);
    await app.close();
    await prisma.$disconnect();
  }
});
