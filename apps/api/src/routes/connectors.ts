import type { FastifyPluginAsync } from "fastify";
import { desc } from "drizzle-orm";
import { connectorAccounts } from "@autochain/db";
import { PaginationParams } from "@autochain/shared";
import { getUser, requireAuth } from "../middleware/auth.js";

export const connectorRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  app.get("/", async (request) => {
    const auth = getUser(request);
    const { page, limit } = PaginationParams.parse(request.query);
    const offset = (page - 1) * limit;

    const all = app.db
      .select()
      .from(connectorAccounts)
      .orderBy(desc(connectorAccounts.updatedAt))
      .all()
      .filter((account) =>
        auth.role === "admin" ? true : account.customerId === auth.customerId,
      );

    return {
      success: true,
      data: all.slice(offset, offset + limit).map((account) => ({
        id: account.id,
        customerId: account.customerId,
        provider: account.provider,
        accountIdentifier: account.accountIdentifier,
        status: account.status,
        scopes: JSON.parse(account.scopes),
        metadata: JSON.parse(account.metadata),
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      })),
      meta: {
        total: all.length,
        page,
        limit,
        totalPages: Math.ceil(all.length / limit),
      },
      error: null,
    };
  });
};
