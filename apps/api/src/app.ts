import Fastify from "fastify";
import cors from "@fastify/cors";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@autochain/db";
import { registerRoutes } from "./routes/index.js";

function cleanupExpiredSessions(db: Db) {
  const now = new Date().toISOString();
  db.run(
    sql`UPDATE user_sessions SET revoked_at = ${now}, revoke_reason = 'expired' WHERE revoked_at IS NULL AND expires_at < ${now}`,
  );
}

interface BuildAppOptions {
  db?: Db;
  dbPath?: string;
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: options.logger ?? false });
  const db = options.db ?? createDb(options.dbPath);
  cleanupExpiredSessions(db);
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
