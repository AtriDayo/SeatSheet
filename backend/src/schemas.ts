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
  seats: z.array(seatInputSchema)
});

export type PlanUpdateInput = z.infer<typeof planUpdateSchema>;
