import type { SeatPlan, Seat } from "@prisma/client";
import { prisma } from "./prisma.js";
import type { PlanUpdateInput } from "./schemas.js";

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

  return prisma.seatPlan.create({
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
}

export async function updateActivePlan(input: PlanUpdateInput): Promise<SeatPlanWithSeats> {
  const plan = await getActivePlan();
  const validSeats = input.seats.filter(
    (seat) => seat.row < input.rows && seat.column < input.columns
  );

  const submittedSeatKeys = new Set(validSeats.map((seat) => `${seat.row}:${seat.column}`));
  const generatedSeats = defaultSeats(input.rows, input.columns).filter(
    (seat) => !submittedSeatKeys.has(`${seat.row}:${seat.column}`)
  );

  await prisma.$transaction([
    prisma.seatPlan.update({
      where: { id: plan.id },
      data: {
        name: input.name,
        rows: input.rows,
        columns: input.columns,
        doorSide: input.doorSide,
        aisleAfterColumns: [...input.aisleAfterColumns].sort((a, b) => a - b),
        showStudentNo: input.showStudentNo,
        rotationConfig: input.rotationConfig
      }
    }),
    prisma.seat.deleteMany({ where: { planId: plan.id } }),
    prisma.seat.createMany({
      data: [...validSeats, ...generatedSeats].map((seat) => ({
        planId: plan.id,
        row: seat.row,
        column: seat.column,
        name: seat.name || null,
        studentNo: seat.studentNo || null
      }))
    })
  ]);

  return getActivePlan();
}
