import type { FastifyPluginAsync } from "fastify";
import { desc, eq, like, or } from "drizzle-orm";
import { memoryItems } from "@autochain/db";
import { CreateMemoryItemRequest, PaginationParams } from "@autochain/shared";
import { getUser, requireAuth, writeAuditLog } from "../middleware/auth.js";

function parseMemoryRow(row: typeof memoryItems.$inferSelect) {
  return {
    id: row.id,
    customerId: row.customerId,
    userId: row.userId ?? null,
    workflowRunId: row.workflowRunId ?? null,
    scope: row.scope,
    namespace: row.namespace,
    title: row.title,
    content: row.content,
    metadata: JSON.parse(row.metadata),
    sourceType: row.sourceType,
    sourceId: row.sourceId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const memoryRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  app.get("/", async (request) => {
    const auth = getUser(request);
    const { page, limit } = PaginationParams.parse(request.query);
    const offset = (page - 1) * limit;

    const allItems = app.db
      .select()
      .from(memoryItems)
      .orderBy(desc(memoryItems.updatedAt))
      .all()
      .filter((item) => item.customerId === auth.customerId)
      .filter((item) =>
        item.scope === "tenant"
          ? true
          : item.scope === "user"
            ? item.userId === auth.userId || auth.role === "admin"
            : auth.role === "admin" || item.userId === auth.userId,
      );

    return {
      success: true,
      data: allItems.slice(offset, offset + limit).map(parseMemoryRow),
      meta: {
        total: allItems.length,
        page,
        limit,
        totalPages: Math.ceil(allItems.length / limit),
      },
      error: null,
    };
  });

  app.get("/search", async (request) => {
    const auth = getUser(request);
    const query = (request.query as Record<string, string>).q?.trim();
    if (!query) {
      return {
        success: true,
        data: [],
        error: null,
      };
    }

    const results = app.db
      .select()
      .from(memoryItems)
      .where(
        or(
          like(memoryItems.title, `%${query}%`),
          like(memoryItems.content, `%${query}%`),
          like(memoryItems.namespace, `%${query}%`),
        ),
      )
      .orderBy(desc(memoryItems.updatedAt))
      .all()
      .filter((item) => item.customerId === auth.customerId)
      .slice(0, 20)
      .map(parseMemoryRow);

    return {
      success: true,
      data: results,
      error: null,
    };
  });

  app.post("/", async (request, reply) => {
    const auth = getUser(request);
    const parsed = CreateMemoryItemRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, data: null, error: "Invalid memory payload" });
    }

    const now = new Date().toISOString();
    const [item] = app.db
      .insert(memoryItems)
      .values({
        customerId: auth.customerId,
        userId: parsed.data.scope === "user" ? auth.userId : null,
        workflowRunId: parsed.data.workflowRunId ?? null,
        scope: parsed.data.scope,
        namespace: parsed.data.namespace,
        title: parsed.data.title,
        content: parsed.data.content,
        metadata: JSON.stringify(parsed.data.metadata),
        sourceType: parsed.data.sourceType,
        sourceId: parsed.data.sourceId ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .all();

    writeAuditLog(app.db, {
      actorUserId: auth.userId,
      actorRole: auth.role,
      customerId: auth.customerId,
      sessionId: auth.sessionId,
      action: "memory.create",
      entityType: "memory_item",
      entityId: String(item!.id),
      details: {
        scope: item!.scope,
        namespace: item!.namespace,
      },
    });

    return reply.status(201).send({
      success: true,
      data: parseMemoryRow(item!),
      error: null,
    });
  });
};
