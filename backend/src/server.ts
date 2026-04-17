import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { env } from "./env.js";
import { prisma } from "./prisma.js";
import { registerRoutes } from "./routes.js";

const app = Fastify({
  logger: true
});

await app.register(sensible);
await app.register(cors, {
  origin(origin, callback) {
    if (!origin || env.corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Not allowed by CORS"), false);
  }
});
await registerRoutes(app);

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: env.port, host: "0.0.0.0" });
