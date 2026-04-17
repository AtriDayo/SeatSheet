import type { FastifyInstance } from "fastify";
import { getActivePlan, updateActivePlan } from "./seatPlanService.js";
import { planUpdateSchema } from "./schemas.js";

export async function registerRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ ok: true }));

  app.get("/api/seat-plan", async () => {
    return getActivePlan();
  });

  app.put("/api/seat-plan", async (request, reply) => {
    const parsed = planUpdateSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.badRequest(parsed.error.message);
    }

    return updateActivePlan(parsed.data);
  });
}
