import { desc, eq } from "drizzle-orm";
import type { Db } from "@autochain/db";
import { chatCaches } from "@autochain/db";

const HOT_CACHE_LIMIT = 250;
const hotPromptCache = new Map<
  string,
  { id: number; hitCount: number; updatedAt: string }
>();

export function normalizePrompt(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildPromptLabel(input: string) {
  const trimmed = input.trim();
  return trimmed.length <= 96 ? trimmed : `${trimmed.slice(0, 93)}...`;
}

function hotKey(input: {
  customerId: number;
  userId: number;
  role: "customer" | "vendor" | "admin";
  normalizedPrompt: string;
}) {
  return `${input.customerId}:${input.userId}:${input.role}:${input.normalizedPrompt}`;
}

export function recordChatCache(input: {
  db: Db;
  customerId: number;
  userId: number;
  sessionId: number | null;
  role: "customer" | "vendor" | "admin";
  sourceMode: "text" | "voice" | "video" | "agentic";
  prompt: string;
  response: string;
}) {
  const normalizedPrompt = normalizePrompt(input.prompt);
  if (!normalizedPrompt) return null;

  const promptLabel = buildPromptLabel(input.prompt);
  const now = new Date().toISOString();
  const key = hotKey({
    customerId: input.customerId,
    userId: input.userId,
    role: input.role,
    normalizedPrompt,
  });

  const existing = input.db
    .select()
    .from(chatCaches)
    .where(eq(chatCaches.normalizedPrompt, normalizedPrompt))
    .all()
    .find(
      (row) =>
        row.customerId === input.customerId &&
        row.userId === input.userId &&
        row.role === input.role,
    );

  if (existing) {
    const nextHitCount = existing.hitCount + 1;
    input.db
      .update(chatCaches)
      .set({
        sessionId: input.sessionId,
        sourceMode: input.sourceMode,
        promptLabel,
        hitCount: nextHitCount,
        lastResponse: input.response,
        updatedAt: now,
      })
      .where(eq(chatCaches.id, existing.id))
      .run();

    hotPromptCache.set(key, {
      id: existing.id,
      hitCount: nextHitCount,
      updatedAt: now,
    });
    return { ...existing, hitCount: nextHitCount, updatedAt: now };
  }

  const [created] = input.db
    .insert(chatCaches)
    .values({
      customerId: input.customerId,
      userId: input.userId,
      sessionId: input.sessionId,
      role: input.role,
      sourceMode: input.sourceMode,
      normalizedPrompt,
      promptLabel,
      hitCount: 1,
      lastResponse: input.response,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .all();

  hotPromptCache.set(key, {
    id: created!.id,
    hitCount: 1,
    updatedAt: now,
  });

  if (hotPromptCache.size > HOT_CACHE_LIMIT) {
    const oldestKey = hotPromptCache.keys().next().value;
    if (oldestKey) hotPromptCache.delete(oldestKey);
  }

  return created ?? null;
}

export function listFrequentChatPrompts(input: {
  db: Db;
  customerId: number;
  userId: number;
  role: "customer" | "vendor" | "admin";
  limit?: number;
}) {
  return input.db
    .select()
    .from(chatCaches)
    .orderBy(desc(chatCaches.hitCount), desc(chatCaches.updatedAt))
    .all()
    .filter(
      (row) =>
        row.customerId === input.customerId &&
        row.role === input.role &&
        (row.userId === input.userId || row.userId === null),
    )
    .slice(0, input.limit ?? 6)
    .map((row) => ({
      id: row.id,
      promptLabel: row.promptLabel,
      hitCount: row.hitCount,
      sourceMode: row.sourceMode,
      updatedAt: row.updatedAt,
    }));
}
