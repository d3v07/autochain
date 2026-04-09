import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { bootstrapDb } from "./bootstrap.js";

export function openSqlite(url?: string): Database.Database {
  const sqlite = new Database(
    url ?? process.env.DATABASE_URL ?? "autochain.db",
  );
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
