import type { SeatPlan, Seat, Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { rotationConfigSchema, seatInputSchema, type PlanUpdateInput } from "./schemas.js";

export type SeatPlanWithSeats = SeatPlan & { seats: Seat[] };

const DEFAULT_ROWS = 5;
const DEFAULT_COLUMNS = 6;

function defaultSeats(rows = DEFAULT_ROWS, columns = DEFAULT_COLUMNS) {
  return Array.from({ length: rows * columns }, (_, index) => ({
    row: Math.floor(index / columns),
    column: index % columns,
    name: null,
    studentNo: null
  }));
}

export async function getActivePlan(): Promise<SeatPlanWithSeats> {
  const activePlan = await prisma.seatPlan.findFirst({
    where: { isActive: true },
    include: { seats: { orderBy: [{ row: "asc" }, { column: "asc" }] } },
    orderBy: { createdAt: "asc" }
  });

  if (activePlan) {
    return activePlan;
  }

  return prisma.$transaction(async (tx) => {
    // Database-scoped initialization lock also covers multiple backend processes.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(1397047636)`;
    const existing = await tx.seatPlan.findFirst({
      where: { isActive: true },
      include: { seats: { orderBy: [{ row: "asc" }, { column: "asc" }] } },
      orderBy: { createdAt: "asc" }
    });
    if (existing) return existing;
    return tx.seatPlan.create({
      data: {
        name: "默认座位表",
        rows: DEFAULT_ROWS,
        columns: DEFAULT_COLUMNS,
        doorSide: "right",
        aisleAfterColumns: [],
        showStudentNo: true,
        rotationConfig: { rules: [] },
        seats: {
          createMany: {
            data: defaultSeats()
          }
        }
      },
      include: { seats: { orderBy: [{ row: "asc" }, { column: "asc" }] } }
    });
  });
}

function stateKey(seats: { row: number; column: number; name?: string | null; studentNo?: string | null }[]) {
  return JSON.stringify([...seats].sort((a, b) => a.row - b.row || a.column - b.column)
    .map(({ row, column, name, studentNo }) => ({ row, column, name: name || null, studentNo: studentNo || null })));
}

function layoutKey(plan: { rows: number; columns: number; aisleAfterColumns: number[] }) {
  return JSON.stringify([plan.rows, plan.columns, [...plan.aisleAfterColumns].sort((a, b) => a - b)]);
}

function conflict(message: string): never {
  throw Object.assign(new Error(message), { statusCode: 409 });
}

export async function updateActivePlan(input: PlanUpdateInput): Promise<SeatPlanWithSeats> {
  const active = await getActivePlan();
  return prisma.$transaction(async (tx) => {
    // Reserve the revision before reading or replacing seats; concurrent writers cannot both win.
    const reserved = await tx.seatPlan.updateMany({
      where: { id: active.id, updatedAt: new Date(input.expectedUpdatedAt) },
      data: { updatedAt: new Date(Math.max(Date.now(), new Date(input.expectedUpdatedAt).getTime() + 1)) }
    });
    if (!reserved.count) conflict("座位表已被其他页面修改。本次操作未保存，请重新加载最新数据后再操作。");
    const plan = await tx.seatPlan.findUniqueOrThrow({ where: { id: active.id }, include: { seats: true } });
    const config = (plan.rotationConfig ?? { rules: [] }) as Record<string, unknown>;
    const currentRules = rotationConfigSchema.parse(config).rules;
    let nextConfig: Record<string, unknown> = { ...config, rules: currentRules };
    const operation = input.operation;
    let next: Pick<PlanUpdateInput, "name" | "rows" | "columns" | "aisleAfterColumns" | "showStudentNo" | "seats"> & { doorSide: string } = input;
    if (operation === "rules") {
      nextConfig = { ...nextConfig, rules: input.rotationConfig.rules, reviewRequired: false };
      next = { ...input, ...plan };
    } else if (operation === "undo") {
      const undo = config.undo as { beforeSeats?: unknown; afterKey?: string; layoutKey?: string } | null;
      if (!undo || undo.afterKey !== stateKey(plan.seats) || undo.layoutKey !== layoutKey(plan)) {
        conflict("无法撤销：上次轮换后名单或布局已修改，或没有可撤销的轮换。");
      }
      const beforeSeats = seatInputSchema.array().parse(undo.beforeSeats);
      next = { ...input, ...plan, seats: beforeSeats };
      nextConfig.undo = null;
    } else if (operation === "rotate") {
      if (!currentRules.length) conflict("没有可执行的轮换规则。");
      if (config.reviewRequired || layoutKey(input) !== layoutKey(plan)) {
        conflict("布局已变化，请先核对并保存轮换规则，避免座位表混乱。");
      }
      if (JSON.stringify(input.rotationConfig.rules) !== JSON.stringify(currentRules)) {
        conflict("请先保存当前轮换规则，再执行轮换。");
      }
      const contents = (seats: typeof input.seats) => JSON.stringify(seats.map((seat) =>
        JSON.stringify([seat.name || null, seat.studentNo || null])).sort());
      const keys = new Set(input.seats.map((seat) => `${seat.row}:${seat.column}`));
      if (input.seats.length !== plan.rows * plan.columns || keys.size !== input.seats.length ||
        input.seats.some((seat) => seat.row >= plan.rows || seat.column >= plan.columns) || contents(input.seats) !== contents(plan.seats)) {
        conflict("轮换结果不完整或名单发生变化，已阻止保存以保护座位表。");
      }
      next = { ...input, ...plan, seats: input.seats };
      nextConfig.undo = {
        beforeSeats: plan.seats.map(({ row, column, name, studentNo }) => ({ row, column, name, studentNo })),
        afterKey: stateKey(input.seats), layoutKey: layoutKey(plan), executedRules: currentRules
      };
    } else {
      nextConfig.rules = input.rotationConfig.rules;
      if (layoutKey(input) !== layoutKey(plan) || JSON.stringify(input.rotationConfig.rules) !== JSON.stringify(currentRules)) {
        nextConfig.reviewRequired = currentRules.length > 0 || input.rotationConfig.rules.length > 0;
      }
      if (layoutKey(input) !== layoutKey(plan) || stateKey(input.seats) !== stateKey(plan.seats)) nextConfig.undo = null;
    }
    // Group references must remain valid before acknowledging a layout or executing a rotation.
    if (operation === "rules" || operation === "rotate") {
      const cuts = [-1, ...[...plan.aisleAfterColumns].sort((a, b) => a - b), plan.columns - 1];
      const widths = cuts.slice(1).map((cut, index) => cut - cuts[index]);
      const valid = input.rotationConfig.rules.every((rule) => {
        if (rule.type === "groupSwap") return rule.sourceGroupIndex !== rule.targetGroupIndex &&
          widths[rule.sourceGroupIndex] !== undefined && widths[rule.sourceGroupIndex] === widths[rule.targetGroupIndex];
        if (rule.type === "groupCycle") return widths[rule.groupIndex] !== undefined;
        return rule.sourceRow < plan.rows && rule.targetRow < plan.rows && rule.sourceColumn < plan.columns && rule.targetColumn < plan.columns;
      });
      if (!valid) conflict("轮换规则包含不存在的位置或不同宽度的大组，请修改这些规则后再保存。");
    }
    const validSeats = next.seats.filter(
      (seat) => seat.row < next.rows && seat.column < next.columns
    );

    const submittedSeatKeys = new Set(validSeats.map((seat) => `${seat.row}:${seat.column}`));
    const generatedSeats = defaultSeats(next.rows, next.columns).filter(
      (seat) => !submittedSeatKeys.has(`${seat.row}:${seat.column}`)
    );

    await tx.seatPlan.update({
      where: { id: plan.id },
      data: {
        name: next.name,
        rows: next.rows,
        columns: next.columns,
        doorSide: next.doorSide,
        aisleAfterColumns: [...next.aisleAfterColumns].sort((a, b) => a - b),
        showStudentNo: next.showStudentNo,
        rotationConfig: nextConfig as Prisma.InputJsonObject,
        updatedAt: plan.updatedAt
      }
    });
    if (operation !== "rules") {
      await tx.seat.deleteMany({ where: { planId: plan.id } });
      await tx.seat.createMany({
        data: [...validSeats, ...generatedSeats].map((seat) => ({
          planId: plan.id,
          row: seat.row,
          column: seat.column,
          name: seat.name || null,
          studentNo: seat.studentNo || null
        }))
      });
    }
    return tx.seatPlan.findUniqueOrThrow({ where: { id: plan.id },
      include: { seats: { orderBy: [{ row: "asc" }, { column: "asc" }] } } });
  });
}
