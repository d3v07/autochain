import type { FastifyPluginAsync } from "fastify";
import { eq, sql } from "drizzle-orm";
import { customers, customerPrices, products } from "@autochain/db";
import { PaginationParams } from "@autochain/shared";
import {
  requireAuth,
  getUser,
  requireClientOrAdmin,
} from "../middleware/auth.js";

export const customerRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);
  app.addHook("preHandler", requireClientOrAdmin);

  app.get("/", async (request) => {
    const { customerId, role } = getUser(request);
    const { page, limit } = PaginationParams.parse(request.query);
    const offset = (page - 1) * limit;

    if (role !== "admin") {
      const customer = app.db
        .select()
        .from(customers)
        .where(eq(customers.id, customerId))
        .get();

      return {
        success: true,
        data: customer ? [customer] : [],
        meta: { total: customer ? 1 : 0, page: 1, limit, totalPages: 1 },
        error: null,
      };
    }

    const [countResult] = app.db
      .select({ count: sql<number>`count(*)` })
      .from(customers)
      .all();
    const total = countResult?.count ?? 0;

    const data = app.db
      .select()
      .from(customers)
      .limit(limit)
      .offset(offset)
      .all();

    return {
      success: true,
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      error: null,
    };
  });

  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const id = Number(request.params.id);
    const { customerId, role } = getUser(request);
    if (role !== "admin" && id !== customerId) {
      return reply
        .status(403)
        .send({ success: false, data: null, error: "Access denied" });
    }
    const customer = app.db
      .select()
      .from(customers)
      .where(eq(customers.id, id))
      .get();
    if (!customer) {
      return reply
        .status(404)
        .send({ success: false, data: null, error: "Customer not found" });
    }
    return { success: true, data: customer, error: null };
  });

  app.get<{ Params: { id: string } }>(
    "/:id/pricing",
    async (request, reply) => {
      const customerId = Number(request.params.id);
      const auth = getUser(request);
      if (auth.role !== "admin" && customerId !== auth.customerId) {
        return reply
          .status(403)
          .send({ success: false, data: null, error: "Access denied" });
      }
      const customer = app.db
        .select()
        .from(customers)
        .where(eq(customers.id, customerId))
        .get();
      if (!customer) {
        return reply
          .status(404)
          .send({ success: false, data: null, error: "Customer not found" });
      }

      const allProducts = app.db.select().from(products).all();
      const overrides = app.db
        .select()
        .from(customerPrices)
        .where(eq(customerPrices.customerId, customerId))
        .all();

      const overrideMap = new Map(overrides.map((o) => [o.productId, o]));

      const pricedProducts = allProducts.map((p) => {
        const override = overrideMap.get(p.id);
        let effectivePrice = p.unitPrice;

        if (override?.customPrice) {
          effectivePrice = override.customPrice;
        } else if (override?.discountPct) {
          effectivePrice =
            Math.round(p.unitPrice * (1 - override.discountPct / 100) * 100) /
            100;
        }

        return {
          ...p,
          listPrice: p.unitPrice,
          effectivePrice,
          hasCustomPricing: !!override,
        };
      });

      return { success: true, data: pricedProducts, error: null };
    },
  );
};
