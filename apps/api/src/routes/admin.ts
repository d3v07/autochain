import { randomBytes } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { desc, eq, sql } from "drizzle-orm";
import {
  auditLogs,
  customers,
  hashSync,
  invoices,
  orders,
  userSessions,
  users,
} from "@autochain/db";
import {
  CreateAdminUserRequest,
  PaginationParams,
  UpdateAdminUserRequest,
} from "@autochain/shared";
import {
  getUser,
  parseFeatureFlags,
  requireAuth,
  requireAdmin,
  revokeSession,
  writeAuditLog,
} from "../middleware/auth.js";

function generateTemporaryPassword() {
  return `${randomBytes(6).toString("base64url")}9!`;
}

function buildHealthScore(input: {
  overdueInvoiceCount: number;
  outstandingBalance: number;
  activeSessionCount: number;
  customerStatus: string;
}) {
  let score = 100;
  score -= input.overdueInvoiceCount * 18;
  score -= Math.min(30, Math.round(input.outstandingBalance / 1000) * 3);
  if (input.activeSessionCount === 0) score -= 12;
  if (input.customerStatus !== "active") score -= 35;
  return Math.max(0, score);
}

function buildRiskLevel(score: number) {
  if (score < 55) return "risk";
  if (score < 80) return "watch";
  return "healthy";
}

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);
  app.addHook("preHandler", requireAdmin);

  app.get("/dashboard", async () => {
    const now = new Date().toISOString();
    const allOrders = app.db
      .select({
        id: orders.id,
        status: orders.status,
        total: orders.total,
      })
      .from(orders)
      .all();

    const allInvoices = app.db
      .select({
        customerId: invoices.customerId,
        amount: invoices.amount,
        status: invoices.status,
      })
      .from(invoices)
      .all();

    const allCustomers = app.db.select().from(customers).all();
    const activeSessions = app.db
      .select()
      .from(userSessions)
      .all()
      .filter((session) => !session.revokedAt && session.expiresAt > now);

    const overdueByCustomer = new Map<number, number>();
    const outstandingByCustomer = new Map<number, number>();
    for (const invoice of allInvoices) {
      if (invoice.status === "overdue") {
        overdueByCustomer.set(
          invoice.customerId,
          (overdueByCustomer.get(invoice.customerId) ?? 0) + 1,
        );
      }
      if (invoice.status === "pending" || invoice.status === "overdue") {
        outstandingByCustomer.set(
          invoice.customerId,
          (outstandingByCustomer.get(invoice.customerId) ?? 0) + invoice.amount,
        );
      }
    }

    const activeSessionsByCustomer = new Map<number, number>();
    for (const session of activeSessions) {
      activeSessionsByCustomer.set(
        session.customerId,
        (activeSessionsByCustomer.get(session.customerId) ?? 0) + 1,
      );
    }

    let atRiskCustomers = 0;
    for (const customer of allCustomers) {
      const score = buildHealthScore({
        overdueInvoiceCount: overdueByCustomer.get(customer.id) ?? 0,
        outstandingBalance: outstandingByCustomer.get(customer.id) ?? 0,
        activeSessionCount: activeSessionsByCustomer.get(customer.id) ?? 0,
        customerStatus: customer.status,
      });
      if (buildRiskLevel(score) === "risk") {
        atRiskCustomers++;
      }
    }

    const [activeCustomersResult] = app.db
      .select({ count: sql<number>`count(*)` })
      .from(customers)
      .where(eq(customers.status, "active"))
      .all();

    const totalRevenue = allOrders
      .filter(
        (order) => order.status === "shipped" || order.status === "delivered",
      )
      .reduce((sum, order) => sum + order.total, 0);

    const outstandingBalance = allInvoices
      .filter(
        (invoice) =>
          invoice.status === "pending" || invoice.status === "overdue",
      )
      .reduce((sum, invoice) => sum + invoice.amount, 0);

    const recentOrders = app.db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        total: orders.total,
        createdAt: orders.createdAt,
        customerId: customers.id,
        companyName: customers.companyName,
      })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .orderBy(desc(orders.createdAt))
      .limit(8)
      .all();

    return {
      success: true,
      data: {
        metrics: {
          totalRevenue,
          orderCount: allOrders.length,
          activeCustomers: activeCustomersResult?.count ?? 0,
          outstandingBalance,
          activeSessions: activeSessions.length,
          atRiskCustomers,
        },
        recentOrders,
      },
      error: null,
    };
  });

  app.get("/customers", async (request) => {
    const { page, limit } = PaginationParams.parse(request.query);
    const offset = (page - 1) * limit;
    const now = new Date().toISOString();

    const allCustomers = app.db.select().from(customers).all();
    const allOrders = app.db
      .select({
        customerId: orders.customerId,
        total: orders.total,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .all();
    const allInvoices = app.db
      .select({
        customerId: invoices.customerId,
        amount: invoices.amount,
        status: invoices.status,
      })
      .from(invoices)
      .all();
    const allSessions = app.db.select().from(userSessions).all();

    const orderCountByCustomer = new Map<number, number>();
    const outstandingByCustomer = new Map<number, number>();
    const overdueByCustomer = new Map<number, number>();
    const lastOrderAtByCustomer = new Map<number, string>();
    const activeSessionCountByCustomer = new Map<number, number>();
    const lastActivityByCustomer = new Map<number, string>();

    for (const order of allOrders) {
      orderCountByCustomer.set(
        order.customerId,
        (orderCountByCustomer.get(order.customerId) ?? 0) + 1,
      );
      const previous = lastOrderAtByCustomer.get(order.customerId);
      if (!previous || order.createdAt > previous) {
        lastOrderAtByCustomer.set(order.customerId, order.createdAt);
      }
    }

    for (const invoice of allInvoices) {
      if (invoice.status === "overdue") {
        overdueByCustomer.set(
          invoice.customerId,
          (overdueByCustomer.get(invoice.customerId) ?? 0) + 1,
        );
      }
      if (invoice.status === "pending" || invoice.status === "overdue") {
        outstandingByCustomer.set(
          invoice.customerId,
          (outstandingByCustomer.get(invoice.customerId) ?? 0) + invoice.amount,
        );
      }
    }

    for (const session of allSessions) {
      if (!session.revokedAt && session.expiresAt > now) {
        activeSessionCountByCustomer.set(
          session.customerId,
          (activeSessionCountByCustomer.get(session.customerId) ?? 0) + 1,
        );
      }
      const previous = lastActivityByCustomer.get(session.customerId);
      if (!previous || session.lastSeenAt > previous) {
        lastActivityByCustomer.set(session.customerId, session.lastSeenAt);
      }
    }

    const data = allCustomers.slice(offset, offset + limit).map((customer) => {
      const overdueInvoiceCount = overdueByCustomer.get(customer.id) ?? 0;
      const outstandingBalance = outstandingByCustomer.get(customer.id) ?? 0;
      const activeSessionCount =
        activeSessionCountByCustomer.get(customer.id) ?? 0;
      const healthScore = buildHealthScore({
        overdueInvoiceCount,
        outstandingBalance,
        activeSessionCount,
        customerStatus: customer.status,
      });

      return {
        id: customer.id,
        companyName: customer.companyName,
        contactName: customer.contactName,
        contactEmail: customer.contactEmail,
        accountNumber: customer.accountNumber,
        status: customer.status,
        city: customer.city,
        state: customer.state,
        orderCount: orderCountByCustomer.get(customer.id) ?? 0,
        outstandingBalance,
        overdueInvoiceCount,
        activeSessionCount,
        lastOrderAt: lastOrderAtByCustomer.get(customer.id) ?? null,
        lastActivityAt: lastActivityByCustomer.get(customer.id) ?? null,
        healthScore,
        riskLevel: buildRiskLevel(healthScore),
      };
    });

    return {
      success: true,
      data,
      meta: {
        total: allCustomers.length,
        page,
        limit,
        totalPages: Math.ceil(allCustomers.length / limit),
      },
      error: null,
    };
  });

  app.get("/orders", async (request) => {
    const { page, limit } = PaginationParams.parse(request.query);
    const query = request.query as Record<string, string>;
    const statusFilter = query.status;
    const customerIdFilter = query.customerId ? Number(query.customerId) : null;

    let allOrders = app.db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        total: orders.total,
        createdAt: orders.createdAt,
        updatedAt: orders.updatedAt,
        customerId: customers.id,
        companyName: customers.companyName,
      })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .orderBy(desc(orders.createdAt))
      .all();

    if (statusFilter) {
      allOrders = allOrders.filter((order) => order.status === statusFilter);
    }

    if (customerIdFilter !== null && Number.isFinite(customerIdFilter)) {
      allOrders = allOrders.filter(
        (order) => order.customerId === customerIdFilter,
      );
    }

    const offset = (page - 1) * limit;
    const data = allOrders.slice(offset, offset + limit);

    return {
      success: true,
      data,
      meta: {
        total: allOrders.length,
        page,
        limit,
        totalPages: Math.ceil(allOrders.length / limit),
      },
      error: null,
    };
  });

  app.get("/users", async (request) => {
    const { page, limit } = PaginationParams.parse(request.query);
    const offset = (page - 1) * limit;
    const now = new Date().toISOString();

    const allUsers = app.db
      .select()
      .from(users)
      .orderBy(desc(users.createdAt))
      .all();
    const allCustomers = app.db
      .select({ id: customers.id, companyName: customers.companyName })
      .from(customers)
      .all();
    const allSessions = app.db.select().from(userSessions).all();
    const companyByCustomerId = new Map(
      allCustomers.map((customer) => [customer.id, customer.companyName]),
    );
    const activeSessionCountByUser = new Map<number, number>();

    for (const session of allSessions) {
      if (!session.revokedAt && session.expiresAt > now) {
        activeSessionCountByUser.set(
          session.userId,
          (activeSessionCountByUser.get(session.userId) ?? 0) + 1,
        );
      }
    }

    const data = allUsers.slice(offset, offset + limit).map((user) => ({
      id: user.id,
      customerId: user.customerId,
      companyName: companyByCustomerId.get(user.customerId) ?? "Unknown",
      email: user.email,
      role: user.role,
      status: user.status,
      mustResetPassword: user.mustResetPassword,
      featureFlags: parseFeatureFlags(user.featureFlags),
      lastLoginAt: user.lastLoginAt ?? null,
      activeSessionCount: activeSessionCountByUser.get(user.id) ?? 0,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));

    return {
      success: true,
      data,
      meta: {
        total: allUsers.length,
        page,
        limit,
        totalPages: Math.ceil(allUsers.length / limit),
      },
      error: null,
    };
  });

  app.post("/users", async (request, reply) => {
    const actor = getUser(request);
    const parsed = CreateAdminUserRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, data: null, error: "Invalid user payload" });
    }

    const existingUser = app.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .get();
    if (existingUser) {
      return reply
        .status(409)
        .send({ success: false, data: null, error: "Email already exists" });
    }

    const customer = app.db
      .select()
      .from(customers)
      .where(eq(customers.id, parsed.data.customerId))
      .get();
    if (!customer) {
      return reply
        .status(404)
        .send({ success: false, data: null, error: "Customer not found" });
    }

    const now = new Date().toISOString();
    const temporaryPassword =
      parsed.data.password ?? generateTemporaryPassword();
    const mustResetPassword = parsed.data.password ? false : true;
    const [created] = app.db
      .insert(users)
      .values({
        customerId: parsed.data.customerId,
        email: parsed.data.email,
        passwordHash: hashSync(temporaryPassword),
        role: parsed.data.role,
        status: parsed.data.status,
        mustResetPassword,
        featureFlags: JSON.stringify(parsed.data.featureFlags),
        updatedAt: now,
      })
      .returning()
      .all();

    writeAuditLog(app.db, {
      actorUserId: actor.userId,
      actorRole: actor.role,
      customerId: created!.customerId,
      targetUserId: created!.id,
      sessionId: actor.sessionId,
      action: "admin.user.create",
      entityType: "user",
      entityId: String(created!.id),
      details: {
        email: created!.email,
        role: created!.role,
        status: created!.status,
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        id: created!.id,
        customerId: created!.customerId,
        companyName: customer.companyName,
        email: created!.email,
        role: created!.role,
        status: created!.status,
        mustResetPassword: created!.mustResetPassword,
        featureFlags: parseFeatureFlags(created!.featureFlags),
        lastLoginAt: created!.lastLoginAt ?? null,
        activeSessionCount: 0,
        createdAt: created!.createdAt,
        updatedAt: created!.updatedAt,
        temporaryPassword: parsed.data.password ? null : temporaryPassword,
      },
      error: null,
    });
  });

  app.patch<{ Params: { id: string } }>(
    "/users/:id",
    async (request, reply) => {
      const actor = getUser(request);
      const userId = Number(request.params.id);
      const parsed = UpdateAdminUserRequest.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({
            success: false,
            data: null,
            error: "Invalid user update payload",
          });
      }

      const target = app.db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .get();
      if (!target) {
        return reply
          .status(404)
          .send({ success: false, data: null, error: "User not found" });
      }

      if (target.id === actor.userId && parsed.data.status === "disabled") {
        return reply.status(400).send({
          success: false,
          data: null,
          error: "You cannot disable your own account",
        });
      }

      if (target.id === actor.userId && parsed.data.role === "customer") {
        return reply.status(400).send({
          success: false,
          data: null,
          error: "You cannot remove your own admin role",
        });
      }

      const changes: Partial<typeof users.$inferInsert> = {
        updatedAt: new Date().toISOString(),
      };
      if (parsed.data.customerId !== undefined)
        changes.customerId = parsed.data.customerId;
      if (parsed.data.role !== undefined) changes.role = parsed.data.role;
      if (parsed.data.status !== undefined) changes.status = parsed.data.status;
      if (parsed.data.mustResetPassword !== undefined) {
        changes.mustResetPassword = parsed.data.mustResetPassword;
      }
      if (parsed.data.featureFlags !== undefined) {
        changes.featureFlags = JSON.stringify(parsed.data.featureFlags);
      }

      const [updated] = app.db
        .update(users)
        .set(changes)
        .where(eq(users.id, userId))
        .returning()
        .all();

      if (updated!.status === "disabled") {
        const targetSessions = app.db
          .select({ id: userSessions.id, revokedAt: userSessions.revokedAt })
          .from(userSessions)
          .where(eq(userSessions.userId, updated!.id))
          .all();

        for (const session of targetSessions) {
          if (!session.revokedAt) {
            revokeSession(app.db, session.id, "user_disabled");
          }
        }
      }

      const customer = app.db
        .select({ companyName: customers.companyName })
        .from(customers)
        .where(eq(customers.id, updated!.customerId))
        .get();

      writeAuditLog(app.db, {
        actorUserId: actor.userId,
        actorRole: actor.role,
        customerId: updated!.customerId,
        targetUserId: updated!.id,
        sessionId: actor.sessionId,
        action: "admin.user.update",
        entityType: "user",
        entityId: String(updated!.id),
        details: parsed.data,
      });

      const activeSessionCount = app.db
        .select()
        .from(userSessions)
        .where(eq(userSessions.userId, updated!.id))
        .all()
        .filter(
          (session) =>
            !session.revokedAt && session.expiresAt > new Date().toISOString(),
        ).length;

      return {
        success: true,
        data: {
          id: updated!.id,
          customerId: updated!.customerId,
          companyName: customer?.companyName ?? "Unknown",
          email: updated!.email,
          role: updated!.role,
          status: updated!.status,
          mustResetPassword: updated!.mustResetPassword,
          featureFlags: parseFeatureFlags(updated!.featureFlags),
          lastLoginAt: updated!.lastLoginAt ?? null,
          activeSessionCount: activeSessionCount ?? 0,
          createdAt: updated!.createdAt,
          updatedAt: updated!.updatedAt,
        },
        error: null,
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/users/:id/reset-password",
    async (request, reply) => {
      const actor = getUser(request);
      const userId = Number(request.params.id);
      const target = app.db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .get();

      if (!target) {
        return reply
          .status(404)
          .send({ success: false, data: null, error: "User not found" });
      }

      const temporaryPassword = generateTemporaryPassword();
      const now = new Date().toISOString();
      app.db
        .update(users)
        .set({
          passwordHash: hashSync(temporaryPassword),
          mustResetPassword: true,
          updatedAt: now,
        })
        .where(eq(users.id, userId))
        .run();

      const sessions = app.db
        .select({ id: userSessions.id, revokedAt: userSessions.revokedAt })
        .from(userSessions)
        .where(eq(userSessions.userId, userId))
        .all();

      for (const session of sessions) {
        if (!session.revokedAt) {
          revokeSession(app.db, session.id, "password_reset");
        }
      }

      writeAuditLog(app.db, {
        actorUserId: actor.userId,
        actorRole: actor.role,
        customerId: target.customerId,
        targetUserId: target.id,
        sessionId: actor.sessionId,
        action: "admin.user.reset_password",
        entityType: "user",
        entityId: String(target.id),
      });

      return {
        success: true,
        data: {
          temporaryPassword,
          mustResetPassword: true,
        },
        error: null,
      };
    },
  );

  app.get("/sessions", async (request) => {
    const { page, limit } = PaginationParams.parse(request.query);
    const query = request.query as Record<string, string>;
    const includeRevoked = query.includeRevoked === "true";
    const offset = (page - 1) * limit;
    const now = new Date().toISOString();

    const allSessions = app.db
      .select()
      .from(userSessions)
      .orderBy(desc(userSessions.createdAt))
      .all();
    const allUsers = app.db
      .select({ id: users.id, email: users.email })
      .from(users)
      .all();
    const allCustomers = app.db
      .select({ id: customers.id, companyName: customers.companyName })
      .from(customers)
      .all();

    const userById = new Map(allUsers.map((user) => [user.id, user]));
    const customerById = new Map(
      allCustomers.map((customer) => [customer.id, customer]),
    );

    const filtered = allSessions.filter((session) => {
      if (includeRevoked) return true;
      return !session.revokedAt && session.expiresAt > now;
    });

    const data = filtered.slice(offset, offset + limit).map((session) => ({
      id: session.id,
      userId: session.userId,
      customerId: session.customerId,
      companyName:
        customerById.get(session.customerId)?.companyName ?? "Unknown",
      email: userById.get(session.userId)?.email ?? "Unknown",
      role: session.role,
      mode: session.mode,
      autonomy: session.autonomy,
      ipAddress: session.ipAddress ?? null,
      userAgent: session.userAgent ?? null,
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt ?? null,
    }));

    return {
      success: true,
      data,
      meta: {
        total: filtered.length,
        page,
        limit,
        totalPages: Math.ceil(filtered.length / limit),
      },
      error: null,
    };
  });

  app.post<{ Params: { id: string } }>(
    "/sessions/:id/revoke",
    async (request, reply) => {
      const actor = getUser(request);
      const sessionId = Number(request.params.id);
      const session = app.db
        .select()
        .from(userSessions)
        .where(eq(userSessions.id, sessionId))
        .get();

      if (!session) {
        return reply
          .status(404)
          .send({ success: false, data: null, error: "Session not found" });
      }

      const revokedAt =
        session.revokedAt ?? revokeSession(app.db, session.id, "admin_revoke");

      writeAuditLog(app.db, {
        actorUserId: actor.userId,
        actorRole: actor.role,
        customerId: session.customerId,
        targetUserId: session.userId,
        sessionId: actor.sessionId,
        action: "admin.session.revoke",
        entityType: "session",
        entityId: String(session.id),
      });

      return {
        success: true,
        data: {
          id: session.id,
          revokedAt,
        },
        error: null,
      };
    },
  );

  app.get("/audit-logs", async (request) => {
    const { page, limit } = PaginationParams.parse(request.query);
    const offset = (page - 1) * limit;

    const allLogs = app.db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .all();

    return {
      success: true,
      data: allLogs.slice(offset, offset + limit).map((log) => ({
        ...log,
        details: JSON.parse(log.details),
      })),
      meta: {
        total: allLogs.length,
        page,
        limit,
        totalPages: Math.ceil(allLogs.length / limit),
      },
      error: null,
    };
  });
};
