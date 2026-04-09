import type { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import { customers, userSessions, users, verifySync } from "@autochain/db";
import { LoginRequest } from "@autochain/shared";
import {
  buildAuthUser,
  createSession,
  getUser,
  requireAuth,
  revokeSession,
  writeAuditLog,
} from "../middleware/auth.js";

function requestUserAgent(raw: string | string[] | undefined) {
  if (Array.isArray(raw)) {
    return raw.join("; ");
  }
  return raw ?? null;
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/login", async (request, reply) => {
    const parsed = LoginRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        data: null,
        error: "Invalid email or password format",
      });
    }

    const { email, password } = parsed.data;
    const user = app.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .get();

    if (!user || !verifySync(password, user.passwordHash)) {
      writeAuditLog(app.db, {
        action: "auth.login",
        entityType: "session",
        entityId: email,
        outcome: "blocked",
        details: { email, reason: "invalid_credentials" },
      });

      return reply.status(401).send({
        success: false,
        data: null,
        error: "Invalid email or password",
      });
    }

    if (user.status !== "active") {
      writeAuditLog(app.db, {
        actorUserId: user.id,
        actorRole: user.role,
        customerId: user.customerId,
        action: "auth.login",
        entityType: "session",
        entityId: user.email,
        outcome: "blocked",
        details: { reason: "user_disabled" },
      });

      return reply.status(403).send({
        success: false,
        data: null,
        error: "User is disabled",
      });
    }

    const customer = app.db
      .select()
      .from(customers)
      .where(eq(customers.id, user.customerId))
      .get();

    const now = new Date().toISOString();
    app.db
      .update(users)
      .set({ lastLoginAt: now, updatedAt: now })
      .where(eq(users.id, user.id))
      .run();

    const { token, session } = createSession({
      db: app.db,
      user: { ...user, lastLoginAt: now, updatedAt: now },
      ipAddress: request.ip,
      userAgent: requestUserAgent(request.headers["user-agent"]),
    });

    writeAuditLog(app.db, {
      actorUserId: user.id,
      actorRole: user.role,
      customerId: user.customerId,
      sessionId: session.id,
      action: "auth.login",
      entityType: "session",
      entityId: String(session.id),
      details: { mode: session.mode, autonomy: session.autonomy },
    });

    return {
      success: true,
      data: {
        token,
        user: buildAuthUser(user, customer),
        session: {
          id: session.id,
          mode: session.mode,
          autonomy: session.autonomy,
          expiresAt: session.expiresAt,
          lastSeenAt: session.lastSeenAt,
        },
      },
      error: null,
    };
  });

  app.get("/me", { preHandler: [requireAuth] }, async (request) => {
    const auth = getUser(request);
    const user = app.db
      .select()
      .from(users)
      .where(eq(users.id, auth.userId))
      .get();
    const customer = app.db
      .select()
      .from(customers)
      .where(eq(customers.id, auth.customerId))
      .get();
    const session = app.db
      .select()
      .from(userSessions)
      .where(eq(userSessions.id, auth.sessionId))
      .get();

    return {
      success: true,
      data: {
        user: buildAuthUser(user!, customer),
        session: {
          id: session!.id,
          mode: session!.mode,
          autonomy: session!.autonomy,
          expiresAt: session!.expiresAt,
          lastSeenAt: session!.lastSeenAt,
        },
      },
      error: null,
    };
  });

  app.post("/logout", { preHandler: [requireAuth] }, async (request) => {
    const auth = getUser(request);
    revokeSession(app.db, auth.sessionId, "logout");

    writeAuditLog(app.db, {
      actorUserId: auth.userId,
      actorRole: auth.role,
      customerId: auth.customerId,
      sessionId: auth.sessionId,
      action: "auth.logout",
      entityType: "session",
      entityId: String(auth.sessionId),
    });

    return {
      success: true,
      data: { revoked: true },
      error: null,
    };
  });
};
