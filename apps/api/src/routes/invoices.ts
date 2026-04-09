import type { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import { invoices } from "@autochain/db";
import {
  requireAuth,
  getUser,
  requireClientOrAdmin,
} from "../middleware/auth.js";

export const invoiceRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);
  app.addHook("preHandler", requireClientOrAdmin);

  app.get("/", async (request) => {
    const { customerId, role } = getUser(request);
    const query = request.query as Record<string, string>;

    const targetCustomerId =
      role === "admin" && query.customerId
        ? Number(query.customerId)
        : customerId;

    const data = app.db
      .select()
      .from(invoices)
      .where(eq(invoices.customerId, targetCustomerId))
      .all();

    return { success: true, data, error: null };
  });

  app.patch<{ Params: { id: string } }>("/:id/pay", async (request, reply) => {
    const id = Number(request.params.id);
    const { customerId } = getUser(request);

    const invoice = app.db
      .select()
      .from(invoices)
      .where(eq(invoices.id, id))
      .get();
    if (!invoice) {
      return reply
        .status(404)
        .send({ success: false, data: null, error: "Invoice not found" });
    }
    if (invoice.customerId !== customerId) {
      return reply
        .status(403)
        .send({ success: false, data: null, error: "Access denied" });
    }
    if (invoice.status === "paid") {
      return reply
        .status(400)
        .send({ success: false, data: null, error: "Invoice already paid" });
    }

    const [updated] = app.db
      .update(invoices)
      .set({ status: "paid", paidAt: new Date().toISOString() })
      .where(eq(invoices.id, id))
      .returning()
      .all();

    return { success: true, data: updated, error: null };
  });
};
