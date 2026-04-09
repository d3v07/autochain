import type { FastifyPluginAsync } from "fastify";
import { eq, sql, like } from "drizzle-orm";
import { products, inventory } from "@autochain/db";
import { PaginationParams } from "@autochain/shared";
import { requireAuth, requireClientOrAdmin } from "../middleware/auth.js";

export const productRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);
  app.addHook("preHandler", requireClientOrAdmin);

  app.get("/", async (request) => {
    const { page, limit } = PaginationParams.parse(request.query);
    const query = request.query as Record<string, string>;
    const category = query.category;
    const search = query.search;
    const offset = (page - 1) * limit;

    let baseQuery = app.db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        description: products.description,
        category: products.category,
        unitPrice: products.unitPrice,
        createdAt: products.createdAt,
        quantityAvailable: inventory.quantityAvailable,
        quantityReserved: inventory.quantityReserved,
      })
      .from(products)
      .leftJoin(inventory, eq(products.id, inventory.productId))
      .$dynamic();

    const conditions: ReturnType<typeof eq>[] = [];
    if (category)
      conditions.push(
        eq(
          products.category,
          category as (typeof products.category.enumValues)[number],
        ),
      );
    if (search) conditions.push(like(products.name, `%${search}%`));

    for (const cond of conditions) {
      baseQuery = baseQuery.where(cond);
    }

    const data = baseQuery.limit(limit).offset(offset).all();

    // Count query
    let countQuery = app.db
      .select({ count: sql<number>`count(*)` })
      .from(products)
      .$dynamic();
    for (const cond of conditions) {
      countQuery = countQuery.where(cond);
    }
    const [countResult] = countQuery.all();
    const total = countResult?.count ?? 0;

    return {
      success: true,
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      error: null,
    };
  });

  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const id = Number(request.params.id);
    const product = app.db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        description: products.description,
        category: products.category,
        unitPrice: products.unitPrice,
        createdAt: products.createdAt,
        quantityAvailable: inventory.quantityAvailable,
        quantityReserved: inventory.quantityReserved,
      })
      .from(products)
      .leftJoin(inventory, eq(products.id, inventory.productId))
      .where(eq(products.id, id))
      .get();

    if (!product) {
      return reply
        .status(404)
        .send({ success: false, data: null, error: "Product not found" });
    }
    return { success: true, data: product, error: null };
  });

  app.get("/categories", async () => {
    const cats = app.db
      .selectDistinct({ category: products.category })
      .from(products)
      .all()
      .map((r) => r.category);
    return { success: true, data: cats, error: null };
  });
};
