export const env = {
  port: Number(process.env.PORT ?? 3000),
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
  corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
};
