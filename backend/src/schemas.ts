import { z } from "zod";

export const seatInputSchema = z.object({
  row: z.number().int().min(0),
  column: z.number().int().min(0),
  name: z.string().trim().max(80).nullable().optional(),
  studentNo: z.string().trim().max(40).nullable().optional()
});

export const planUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  rows: z.number().int().min(1).max(30),
  columns: z.number().int().min(1).max(30),
  doorSide: z.enum(["left", "right"]),
  aisleAfterColumns: z.array(z.number().int().min(0)).default([]),
  showStudentNo: z.boolean().default(true),
  seats: z.array(seatInputSchema)
}).superRefine((plan, context) => {
  const aisleAfterColumns = new Set(plan.aisleAfterColumns);

  if (aisleAfterColumns.size !== plan.aisleAfterColumns.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["aisleAfterColumns"],
      message: "过道位置不能重复"
    });
  }

  if (plan.aisleAfterColumns.some((column) => column >= plan.columns - 1)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["aisleAfterColumns"],
      message: "过道只能设置在两列座位之间"
    });
  }
});

export type PlanUpdateInput = z.infer<typeof planUpdateSchema>;
