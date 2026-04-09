import Fastify from "fastify";
import cors from "@fastify/cors";
import { createDb, type Db } from "@autochain/db";
import { registerRoutes } from "./routes/index.js";

interface BuildAppOptions {
  db?: Db;
  dbPath?: string;
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: options.logger ?? false });
  const db = options.db ?? createDb(options.dbPath);
  const allowedOrigins = (
    process.env.CORS_ORIGIN ?? "http://localhost:3000,http://127.0.0.1:3000"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin '${origin}' is not allowed by CORS`), false);
    },
    methods: ["GET", "HEAD", "POST", "PATCH", "DELETE", "OPTIONS"],
  });

  app.decorate("db", db);

  app.get("/health", async () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  }));

  await registerRoutes(app);
  return app;
}
