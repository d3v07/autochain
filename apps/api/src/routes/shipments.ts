import type { FastifyPluginAsync } from "fastify";
import { eq, inArray } from "drizzle-orm";
import { orders, shipments } from "@autochain/db";
import {
  requireAuth,
  getUser,
  requireClientOrAdmin,
} from "../middleware/auth.js";

interface ShipmentEvent {
  status: string;
  description: string;
  location?: string;
  timestamp: string;
}

export const shipmentRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);
  app.addHook("preHandler", requireClientOrAdmin);

  app.get("/", async (request) => {
    const { customerId, role } = getUser(request);
    const query = request.query as Record<string, string>;

    const targetCustomerId =
      role === "admin" && query.customerId
        ? Number(query.customerId)
        : customerId;
    const limit = Math.min(Math.max(Number(query.limit ?? 6), 1), 100);

    const customerOrders = app.db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
      })
      .from(orders)
      .where(eq(orders.customerId, targetCustomerId))
      .all();

    const orderIds = customerOrders.map((order) => order.id);
    const orderMetaById = new Map(
      customerOrders.map((order) => [order.id, order]),
    );

    const data = (
      orderIds.length > 0
        ? app.db
            .select()
            .from(shipments)
            .where(inArray(shipments.orderId, orderIds))
            .all()
        : []
    )
      .map((shipment) => {
        const order = orderMetaById.get(shipment.orderId);
        let parsedEvents: ShipmentEvent[] = [];
        try {
          const parsed = JSON.parse(shipment.events);
          if (Array.isArray(parsed)) {
            parsedEvents = parsed as ShipmentEvent[];
          }
        } catch {
          parsedEvents = [];
        }

        return {
          ...shipment,
          orderNumber: order?.orderNumber ?? `Order ${shipment.orderId}`,
          orderStatus: order?.status ?? "unknown",
          events: parsedEvents,
        };
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, Number.isFinite(limit) ? limit : 6);

    return {
      success: true,
      data,
      error: null,
    };
  });

  app.get<{ Params: { orderId: string } }>(
    "/:orderId",
    async (request, reply) => {
      const orderId = Number(request.params.orderId);
      if (!Number.isFinite(orderId)) {
        return reply.status(400).send({
          success: false,
          data: null,
          error: "Invalid order id",
        });
      }

      const { customerId, role } = getUser(request);

      const order = app.db
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .get();
      if (!order) {
        return reply.status(404).send({
          success: false,
          data: null,
          error: "Order not found",
        });
      }

      if (role !== "admin" && order.customerId !== customerId) {
        return reply.status(403).send({
          success: false,
          data: null,
          error: "Access denied",
        });
      }

      const shipment = app.db
        .select()
        .from(shipments)
        .where(eq(shipments.orderId, orderId))
        .get();

      if (!shipment) {
        return reply.status(404).send({
          success: false,
          data: null,
          error: "Shipment not found",
        });
      }

      let parsedEvents: ShipmentEvent[] = [];
      try {
        const parsed = JSON.parse(shipment.events);
        if (Array.isArray(parsed)) {
          parsedEvents = parsed as ShipmentEvent[];
        }
      } catch {
        parsedEvents = [];
      }

      return {
        success: true,
        data: {
          ...shipment,
          events: parsedEvents,
        },
        error: null,
      };
    },
  );
};
