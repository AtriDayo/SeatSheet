import type { FastifyInstance } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { env } from "./env.js";
import { getActivePlan, updateActivePlan } from "./seatPlanService.js";
import { planUpdateSchema } from "./schemas.js";

function isAdminPasswordValid(password: unknown) {
  if (!env.adminPassword || typeof password !== "string") {
    return false;
  }

  const expected = Buffer.from(env.adminPassword);
  const actual = Buffer.from(password);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function registerRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ ok: true }));

  app.get("/api/seat-plan", async () => {
    return getActivePlan();
  });

  app.post("/api/admin/verify", async (request, reply) => {
    const password =
      typeof request.body === "object" && request.body && "password" in request.body
        ? (request.body as { password?: unknown }).password
        : undefined;

    if (!isAdminPasswordValid(password)) {
      return reply.unauthorized("管理密码错误");
    }

    return { ok: true };
  });

  app.put("/api/seat-plan", async (request, reply) => {
    if (!isAdminPasswordValid(request.headers["x-admin-password"])) {
      return reply.unauthorized("管理密码错误");
    }

    const parsed = planUpdateSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.badRequest(parsed.error.message);
    }

    return updateActivePlan(parsed.data);
  });
}
