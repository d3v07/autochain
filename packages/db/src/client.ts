import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { bootstrapDb } from "./bootstrap.js";

const __pkgDir = dirname(dirname(fileURLToPath(import.meta.url)));

function findMonorepoRoot(start: string): string {
  let dir = start;
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = dirname(dir);
  }
  return start;
}

export function getDbPath(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const root = findMonorepoRoot(__pkgDir);
  const dataDir = resolve(root, "data");
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  return join(dataDir, "autochain.db");
}

export function openSqlite(url?: string): Database.Database {
  const sqlite = new Database(url ?? getDbPath());
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  bootstrapDb(sqlite);
  return sqlite;
}

export function createDb(url?: string) {
  const sqlite = openSqlite(url);
  return drizzle(sqlite, { schema });
}

export type Db = ReturnType<typeof createDb>;
