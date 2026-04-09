import { randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Db } from "@autochain/db";
import { auditLogs, customers, userSessions, users } from "@autochain/db";

const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS ?? 24);
const FEATURE_VOICE_ASSISTANT = process.env.FEATURE_VOICE_ASSISTANT !== "false";
const FEATURE_VIDEO_ASSISTANT = process.env.FEATURE_VIDEO_ASSISTANT !== "false";
const FEATURE_AGENTIC_MODE = process.env.FEATURE_AGENTIC_MODE !== "false";
const FEATURE_AGENTIC_AUTONOMY =
  process.env.FEATURE_AGENTIC_AUTONOMY !== "false";
const FEATURE_ADMIN_AI = process.env.FEATURE_ADMIN_AI !== "false";

export interface AuthSession {
  sessionId: number;
  sessionToken: string;
  userId: number;
  customerId: number;
  role: "customer" | "vendor" | "admin";
  accountType: "client" | "vendor";
  accountNumber: string;
  companyName: string;
  status: "active" | "disabled";
  featureFlags: string[];
  mode: "text" | "voice" | "video" | "agentic";
  autonomy: "manual" | "ask" | "agent";
  availableModes: Array<"text" | "voice" | "video" | "agentic">;
  availableAutonomy: Array<"manual" | "ask" | "agent">;
}

interface CreateSessionInput {
  db: Db;
  user: typeof users.$inferSelect;
  mode?: "text" | "voice" | "video" | "agentic";
  autonomy?: "manual" | "ask" | "agent";
  ipAddress?: string | null;
  userAgent?: string | null;
}

interface AuditEntry {
  actorUserId?: number | null;
  actorRole?: "customer" | "vendor" | "admin" | "system";
  customerId?: number | null;
  targetUserId?: number | null;
  sessionId?: number | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  outcome?: "success" | "blocked" | "cancelled" | "failed";
  details?: Record<string, unknown>;
}

export function parseFeatureFlags(raw: string | null | undefined) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function featureAllowed(
  flags: string[],
  feature: string,
  globalEnabled = true,
): boolean {
  if (!globalEnabled) return false;
  if (flags.length === 0) return true;
  return flags.includes(feature);
}

export function getAvailableModes(
  role: "customer" | "vendor" | "admin",
  featureFlags: string[],
) {
  const available: Array<"text" | "voice" | "video" | "agentic"> = ["text"];

  if (
    featureAllowed(featureFlags, "voice_assistant", FEATURE_VOICE_ASSISTANT)
  ) {
    available.push("voice");
  }

  if (
    featureAllowed(featureFlags, "video_assistant", FEATURE_VIDEO_ASSISTANT)
  ) {
    available.push("video");
  }

  const agenticAllowed =
    role === "admin"
      ? featureAllowed(featureFlags, "admin_ai", FEATURE_ADMIN_AI) &&
        featureAllowed(featureFlags, "agentic_mode", FEATURE_AGENTIC_MODE)
      : featureAllowed(featureFlags, "agentic_mode", FEATURE_AGENTIC_MODE);

  if (agenticAllowed) {
    available.push("agentic");
  }

  return available;
}

export function getAvailableAutonomy(
  availableModes: Array<"text" | "voice" | "video" | "agentic">,
) {
  const levels: Array<"manual" | "ask" | "agent"> = ["manual", "ask"];
  if (availableModes.includes("agentic") && FEATURE_AGENTIC_AUTONOMY) {
    levels.push("agent");
  }
  return levels;
}

export function createSessionToken() {
  return randomBytes(24).toString("hex");
}

export function createSession({
  db,
  user,
  mode = "text",
  autonomy = "manual",
  ipAddress,
  userAgent,
}: CreateSessionInput) {
  const featureFlags = parseFeatureFlags(user.featureFlags);
  const availableModes = getAvailableModes(user.role, featureFlags);
  const safeMode = availableModes.includes(mode) ? mode : "text";
  const availableAutonomy = getAvailableAutonomy(availableModes);
  const safeAutonomy = availableAutonomy.includes(autonomy)
    ? autonomy
    : "manual";
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + SESSION_TTL_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const token = createSessionToken();

  const [session] = db
    .insert(userSessions)
    .values({
      userId: user.id,
      customerId: user.customerId,
      role: user.role,
      sessionToken: token,
      mode: safeMode,
      autonomy: safeAutonomy,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      lastSeenAt: now.toISOString(),
      expiresAt,
    })
    .returning()
    .all();

  return { token, session: session! };
}

export function revokeSession(
  db: Db,
  sessionId: number,
  revokeReason = "manual_revoke",
) {
  const revokedAt = new Date().toISOString();
  db.update(userSessions)
    .set({ revokedAt, revokeReason })
    .where(eq(userSessions.id, sessionId))
    .run();
  return revokedAt;
}

export function writeAuditLog(db: Db, entry: AuditEntry) {
  db.insert(auditLogs)
    .values({
      actorUserId: entry.actorUserId ?? null,
      actorRole: entry.actorRole ?? "system",
      customerId: entry.customerId ?? null,
      targetUserId: entry.targetUserId ?? null,
      sessionId: entry.sessionId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      outcome: entry.outcome ?? "success",
      details: JSON.stringify(entry.details ?? {}),
    })
    .run();
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return reply.status(401).send({
      success: false,
      data: null,
      error: "Missing authorization token",
    });
  }

  const token = header.slice(7);
  const now = new Date().toISOString();
  const session = request.server.db
    .select()
    .from(userSessions)
    .where(
      and(
        eq(userSessions.sessionToken, token),
        isNull(userSessions.revokedAt),
        gt(userSessions.expiresAt, now),
      ),
    )
    .get();

  if (!session) {
    return reply
      .status(401)
      .send({
        success: false,
        data: null,
        error: "Invalid or expired session",
      });
  }

  const user = request.server.db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .get();

  if (!user || user.status !== "active") {
    return reply.status(403).send({
      success: false,
      data: null,
      error: "User is disabled",
    });
  }

  request.server.db
    .update(userSessions)
    .set({ lastSeenAt: now })
    .where(eq(userSessions.id, session.id))
    .run();

  const featureFlags = parseFeatureFlags(user.featureFlags);
  const availableModes = getAvailableModes(user.role, featureFlags);
  const availableAutonomy = getAvailableAutonomy(availableModes);
  const account = request.server.db
    .select()
    .from(customers)
    .where(eq(customers.id, user.customerId))
    .get();
  const mode = availableModes.includes(session.mode) ? session.mode : "text";
  const autonomy = availableAutonomy.includes(session.autonomy)
    ? session.autonomy
    : "manual";

  (
    request as FastifyRequest & {
      user: AuthSession;
    }
  ).user = {
    sessionId: session.id,
    sessionToken: session.sessionToken,
    userId: user.id,
    customerId: user.customerId,
    role: user.role,
    accountType:
      (account?.accountType as "client" | "vendor" | undefined) ?? "client",
    accountNumber: account?.accountNumber ?? "",
    companyName: account?.companyName ?? "",
    status: user.status,
    featureFlags,
    mode,
    autonomy,
    availableModes,
    availableAutonomy,
  };
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { role } = getUser(request);
  if (role === "admin") {
    return;
  }

  return reply.status(403).send({
    success: false,
    data: null,
    error: "Admin access required",
  });
}

export async function requireClientOrAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { role } = getUser(request);
  if (role === "admin" || role === "customer") {
    return;
  }

  return reply.status(403).send({
    success: false,
    data: null,
    error: "Client or admin access required",
  });
}

export async function requireVendorOrAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { role } = getUser(request);
  if (role === "admin" || role === "vendor") {
    return;
  }

  return reply.status(403).send({
    success: false,
    data: null,
    error: "Vendor or admin access required",
  });
}

export function getUser(request: FastifyRequest): AuthSession {
  return (request as FastifyRequest & { user: AuthSession }).user;
}

export function buildAuthUser(
  user: typeof users.$inferSelect,
  account: typeof customers.$inferSelect | null | undefined,
): {
  id: number;
  email: string;
  role: "customer" | "vendor" | "admin";
  status: "active" | "disabled";
  customerId: number;
  companyName: string;
  accountType: "client" | "vendor";
  accountNumber: string;
  mustResetPassword: boolean;
  featureFlags: string[];
  availableModes: Array<"text" | "voice" | "video" | "agentic">;
  availableAutonomy: Array<"manual" | "ask" | "agent">;
} {
  const featureFlags = parseFeatureFlags(user.featureFlags);
  const availableModes = getAvailableModes(user.role, featureFlags);
  const availableAutonomy = getAvailableAutonomy(availableModes);

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    customerId: user.customerId,
    companyName: account?.companyName ?? "",
    accountType:
      (account?.accountType as "client" | "vendor" | undefined) ?? "client",
    accountNumber: account?.accountNumber ?? "",
    mustResetPassword: user.mustResetPassword,
    featureFlags,
    availableModes,
    availableAutonomy,
  };
}

export function getCustomerCompanyName(db: Db, customerId: number) {
  return (
    db
      .select({ companyName: customers.companyName })
      .from(customers)
      .where(eq(customers.id, customerId))
      .get()?.companyName ?? ""
  );
}
