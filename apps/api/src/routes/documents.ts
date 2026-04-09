import type { FastifyPluginAsync } from "fastify";
import { desc, eq } from "drizzle-orm";
import type { Db } from "@autochain/db";
import { documents, documentVersions } from "@autochain/db";
import { CreateDocumentRequest, PaginationParams } from "@autochain/shared";
import { getUser, requireAuth, writeAuditLog } from "../middleware/auth.js";
import { createGeneratedDocument } from "../lib/document-studio.js";

function parseDocumentVersions(documentId: number, db: Db) {
  return db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId))
    .orderBy(desc(documentVersions.versionNumber))
    .all()
    .map((version) => ({
      id: version.id,
      versionNumber: version.versionNumber,
      title: version.title,
      contentMarkdown: version.contentMarkdown,
      contentHtml: version.contentHtml ?? null,
      metadata: JSON.parse(version.metadata),
      filePath: version.filePath ?? null,
      createdByUserId: version.createdByUserId,
      createdAt: version.createdAt,
    }));
}

export const documentRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  app.get("/", async (request) => {
    const auth = getUser(request);
    const { page, limit } = PaginationParams.parse(request.query);
    const offset = (page - 1) * limit;

    const allDocuments = app.db
      .select()
      .from(documents)
      .orderBy(desc(documents.updatedAt))
      .all()
      .filter((document) =>
        auth.role === "admin" ? true : document.customerId === auth.customerId,
      );

    const paged = allDocuments
      .slice(offset, offset + limit)
      .map((document) => ({
        id: document.id,
        customerId: document.customerId,
        ownerUserId: document.ownerUserId,
        kind: document.kind,
        title: document.title,
        status: document.status,
        currentVersionNumber: document.currentVersionNumber,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
      }));

    return {
      success: true,
      data: paged,
      meta: {
        total: allDocuments.length,
        page,
        limit,
        totalPages: Math.ceil(allDocuments.length / limit),
      },
      error: null,
    };
  });

  app.post("/", async (request, reply) => {
    const auth = getUser(request);
    const parsed = CreateDocumentRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({
          success: false,
          data: null,
          error: "Invalid document payload",
        });
    }

    const { document, version } = await createGeneratedDocument({
      db: app.db,
      customerId: auth.customerId,
      ownerUserId: auth.userId,
      kind: parsed.data.kind,
      title: parsed.data.title,
      prompt: parsed.data.prompt,
    });

    writeAuditLog(app.db, {
      actorUserId: auth.userId,
      actorRole: auth.role,
      customerId: auth.customerId,
      sessionId: auth.sessionId,
      action: "document.create",
      entityType: "document",
      entityId: String(document.id),
      details: {
        kind: document.kind,
        version: version.versionNumber,
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        id: document.id,
        customerId: document.customerId,
        ownerUserId: document.ownerUserId,
        kind: document.kind,
        title: document.title,
        status: document.status,
        currentVersionNumber: document.currentVersionNumber,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
        versions: [
          {
            id: version.id,
            versionNumber: version.versionNumber,
            title: version.title,
            contentMarkdown: version.contentMarkdown,
            contentHtml: version.contentHtml ?? null,
            metadata: JSON.parse(version.metadata),
            filePath: version.filePath ?? null,
            createdByUserId: version.createdByUserId,
            createdAt: version.createdAt,
          },
        ],
      },
      error: null,
    });
  });

  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const auth = getUser(request);
    const documentId = Number(request.params.id);
    const document = app.db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .get();

    if (!document) {
      return reply
        .status(404)
        .send({ success: false, data: null, error: "Document not found" });
    }
    if (auth.role !== "admin" && document.customerId !== auth.customerId) {
      return reply
        .status(403)
        .send({ success: false, data: null, error: "Access denied" });
    }

    return {
      success: true,
      data: {
        id: document.id,
        customerId: document.customerId,
        ownerUserId: document.ownerUserId,
        kind: document.kind,
        title: document.title,
        status: document.status,
        currentVersionNumber: document.currentVersionNumber,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
        versions: parseDocumentVersions(document.id, app.db),
      },
      error: null,
    };
  });
};
