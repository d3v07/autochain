import type { FastifyPluginAsync } from "fastify";
import { desc, eq } from "drizzle-orm";
import { ediTransactions, orders, customers } from "@autochain/db";
import {
  requireAuth,
  getUser,
  requireClientOrAdmin,
} from "../middleware/auth.js";

export const ediRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);
  app.addHook("preHandler", requireClientOrAdmin);

  app.get("/transactions", async (request) => {
    const { customerId, role } = getUser(request);
    const query = request.query as Record<string, string>;

    const customerFilter =
      role === "admin" && query.customerId
        ? Number(query.customerId)
        : role === "admin"
          ? null
          : customerId;

    const typeFilter = query.type;
    const statusFilter = query.status;

    let data = app.db
      .select({
        id: ediTransactions.id,
        orderId: ediTransactions.orderId,
        orderNumber: orders.orderNumber,
        customerId: orders.customerId,
        companyName: customers.companyName,
        type: ediTransactions.type,
        direction: ediTransactions.direction,
        payload: ediTransactions.payload,
        status: ediTransactions.status,
        createdAt: ediTransactions.createdAt,
      })
      .from(ediTransactions)
      .leftJoin(orders, eq(ediTransactions.orderId, orders.id))
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .orderBy(desc(ediTransactions.createdAt))
      .all();

    if (customerFilter !== null) {
      data = data.filter((item) => item.customerId === customerFilter);
    }

    if (typeFilter) {
      data = data.filter((item) => item.type === typeFilter);
    }

    if (statusFilter) {
      data = data.filter((item) => item.status === statusFilter);
    }

    return {
      success: true,
      data,
      error: null,
    };
  });
};
