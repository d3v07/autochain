import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { bootstrapDb } from "./bootstrap.js";

function findPackageRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (dir !== dirname(dir)) {
    const pkg = join(dir, "package.json");
    if (existsSync(pkg)) {
      try {
        const parsed = JSON.parse(readFileSync(pkg, "utf-8"));
        if (parsed.name === "@autochain/db") return dir;
      } catch {}
    }
    dir = dirname(dir);
  }
  return process.cwd();
}

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
  const root = findMonorepoRoot(findPackageRoot());
  return join(root, "data", "autochain.db");
}

export function openSqlite(url?: string): Database.Database {
  const dbPath = url ?? getDbPath();
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const sqlite = new Database(dbPath);
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
