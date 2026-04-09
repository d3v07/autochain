import type { FastifyPluginAsync } from "fastify";
import { eq, sql, desc } from "drizzle-orm";
import {
  orders,
  orderLines,
  products,
  inventory,
  invoices,
  shipments,
  ediTransactions,
} from "@autochain/db";
import {
  CreateOrder,
  ORDER_STATUS_TRANSITIONS,
  type OrderStatus,
} from "@autochain/shared";
import {
  requireAuth,
  getUser,
  requireClientOrAdmin,
} from "../middleware/auth.js";

let orderCounter = 100;

function generateOrderNumber(): string {
  orderCounter++;
  return `ESP-2026-${String(orderCounter).padStart(4, "0")}`;
}

function generateTrackingNumber(orderId: number): string {
  const stamp = Date.now().toString().slice(-6);
  return `AutoChain${String(orderId).padStart(4, "0")}${stamp}`;
}

function buildShipmentEvents(orderNumber: string) {
  const now = new Date();
  return [
    {
      status: "created",
      description: `Shipment label created for ${orderNumber}`,
      location: "Dallas, TX",
      timestamp: now.toISOString(),
    },
    {
      status: "in_transit",
      description: "Package departed origin facility",
      location: "Dallas, TX",
      timestamp: new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString(),
    },
  ];
}

export const orderRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);
  app.addHook("preHandler", requireClientOrAdmin);

  // List orders for the authenticated customer
  app.get("/", async (request) => {
    const { customerId, role } = getUser(request);
    const query = request.query as Record<string, string>;

    const targetCustomerId =
      role === "admin" && query.customerId
        ? Number(query.customerId)
        : customerId;

    const data = app.db
      .select()
      .from(orders)
      .where(eq(orders.customerId, targetCustomerId))
      .orderBy(desc(orders.createdAt))
      .all();

    return { success: true, data, error: null };
  });

  // Get single order with lines
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const id = Number(request.params.id);
    const { customerId, role } = getUser(request);

    const order = app.db.select().from(orders).where(eq(orders.id, id)).get();
    if (!order) {
      return reply
        .status(404)
        .send({ success: false, data: null, error: "Order not found" });
    }
    if (role !== "admin" && order.customerId !== customerId) {
      return reply
        .status(403)
        .send({ success: false, data: null, error: "Access denied" });
    }

    const lines = app.db
      .select({
        id: orderLines.id,
        orderId: orderLines.orderId,
        productId: orderLines.productId,
        quantity: orderLines.quantity,
        unitPrice: orderLines.unitPrice,
        lineTotal: orderLines.lineTotal,
        productName: products.name,
        productSku: products.sku,
      })
      .from(orderLines)
      .leftJoin(products, eq(orderLines.productId, products.id))
      .where(eq(orderLines.orderId, id))
      .all();

    return { success: true, data: { ...order, lines }, error: null };
  });

  // Create order
  app.post("/", async (request, reply) => {
    const { customerId } = getUser(request);
    const parsed = CreateOrder.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, data: null, error: "Invalid order data" });
    }

    const { lines } = parsed.data;
    let total = 0;
    const resolvedLines: {
      productId: number;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
    }[] = [];

    for (const line of lines) {
      const product = app.db
        .select()
        .from(products)
        .where(eq(products.id, line.productId))
        .get();
      if (!product) {
        return reply.status(400).send({
          success: false,
          data: null,
          error: `Product ${line.productId} not found`,
        });
      }

      const inv = app.db
        .select()
        .from(inventory)
        .where(eq(inventory.productId, line.productId))
        .get();
      if (!inv || inv.quantityAvailable < line.quantity) {
        return reply.status(400).send({
          success: false,
          data: null,
          error: `Insufficient inventory for ${product.name} (available: ${inv?.quantityAvailable ?? 0}, requested: ${line.quantity})`,
        });
      }

      const lineTotal =
        Math.round(product.unitPrice * line.quantity * 100) / 100;
      total += lineTotal;
      resolvedLines.push({
        productId: line.productId,
        quantity: line.quantity,
        unitPrice: product.unitPrice,
        lineTotal,
      });
    }

    const orderNumber = generateOrderNumber();
    const [order] = app.db
      .insert(orders)
      .values({
        customerId,
        orderNumber,
        status: "draft",
        total: Math.round(total * 100) / 100,
      })
      .returning()
      .all();

    app.db
      .insert(orderLines)
      .values(resolvedLines.map((l) => ({ ...l, orderId: order!.id })))
      .run();

    return reply.status(201).send({ success: true, data: order, error: null });
  });

  // Update order status
  app.patch<{ Params: { id: string } }>(
    "/:id/status",
    async (request, reply) => {
      const id = Number(request.params.id);
      const { customerId, role } = getUser(request);
      const { status: newStatus } = request.body as { status: OrderStatus };

      const order = app.db.select().from(orders).where(eq(orders.id, id)).get();
      if (!order) {
        return reply
          .status(404)
          .send({ success: false, data: null, error: "Order not found" });
      }
      if (role !== "admin" && order.customerId !== customerId) {
        return reply
          .status(403)
          .send({ success: false, data: null, error: "Access denied" });
      }

      const allowed = ORDER_STATUS_TRANSITIONS[order.status as OrderStatus];
      if (!allowed?.includes(newStatus)) {
        return reply.status(400).send({
          success: false,
          data: null,
          error: `Cannot transition from '${order.status}' to '${newStatus}'`,
        });
      }

      const now = new Date().toISOString();

      // Handle inventory side effects
      const lines = app.db
        .select()
        .from(orderLines)
        .where(eq(orderLines.orderId, id))
        .all();

      if (newStatus === "confirmed") {
        for (const line of lines) {
          app.db
            .update(inventory)
            .set({
              quantityAvailable: sql`quantity_available - ${line.quantity}`,
              quantityReserved: sql`quantity_reserved + ${line.quantity}`,
              updatedAt: now,
            })
            .where(eq(inventory.productId, line.productId))
            .run();
        }

        const existing850 = app.db
          .select({ id: ediTransactions.id, type: ediTransactions.type })
          .from(ediTransactions)
          .where(eq(ediTransactions.orderId, id))
          .all()
          .find((tx) => tx.type === "850");

        if (!existing850) {
          app.db
            .insert(ediTransactions)
            .values({
              orderId: id,
              type: "850",
              direction: "outbound",
              payload: JSON.stringify({
                orderNumber: order.orderNumber,
                customerId: order.customerId,
                status: "confirmed",
                lines: lines.map((line) => ({
                  productId: line.productId,
                  quantity: line.quantity,
                  unitPrice: line.unitPrice,
                })),
              }),
              status: "sent",
            })
            .run();
        }
      }

      if (newStatus === "shipped") {
        for (const line of lines) {
          app.db
            .update(inventory)
            .set({
              quantityReserved: sql`quantity_reserved - ${line.quantity}`,
              updatedAt: now,
            })
            .where(eq(inventory.productId, line.productId))
            .run();
        }

        const existingShipment = app.db
          .select({
            id: shipments.id,
            trackingNumber: shipments.trackingNumber,
          })
          .from(shipments)
          .where(eq(shipments.orderId, id))
          .get();
        let trackingNumber = existingShipment?.trackingNumber;

        if (!existingShipment) {
          const eta = new Date();
          eta.setDate(eta.getDate() + 5);
          trackingNumber = generateTrackingNumber(id);
          app.db
            .insert(shipments)
            .values({
              orderId: id,
              carrier: "UPS Freight",
              trackingNumber,
              status: "in_transit",
              estimatedDelivery: eta.toISOString().split("T")[0]!,
              events: JSON.stringify(buildShipmentEvents(order.orderNumber)),
            })
            .run();
        }

        const existingInvoice = app.db
          .select({ id: invoices.id })
          .from(invoices)
          .where(eq(invoices.orderId, id))
          .get();

        if (!existingInvoice) {
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 30);
          app.db
            .insert(invoices)
            .values({
              orderId: id,
              customerId: order.customerId,
              invoiceNumber: order.orderNumber.replace("ESP-", "INV-"),
              amount: order.total,
              status: "pending",
              dueDate: dueDate.toISOString().split("T")[0]!,
            })
            .run();
        }

        const existing856 = app.db
          .select({ id: ediTransactions.id, type: ediTransactions.type })
          .from(ediTransactions)
          .where(eq(ediTransactions.orderId, id))
          .all()
          .find((tx) => tx.type === "856");

        if (!existing856) {
          app.db
            .insert(ediTransactions)
            .values({
              orderId: id,
              type: "856",
              direction: "outbound",
              payload: JSON.stringify({
                orderNumber: order.orderNumber,
                customerId: order.customerId,
                status: "shipped",
                trackingNumber,
                lines: lines.map((line) => ({
                  productId: line.productId,
                  quantity: line.quantity,
                })),
              }),
              status: "sent",
            })
            .run();
        }
      }

      if (
        newStatus === "cancelled" &&
        (order.status === "confirmed" || order.status === "processing")
      ) {
        for (const line of lines) {
          app.db
            .update(inventory)
            .set({
              quantityAvailable: sql`quantity_available + ${line.quantity}`,
              quantityReserved: sql`quantity_reserved - ${line.quantity}`,
              updatedAt: now,
            })
            .where(eq(inventory.productId, line.productId))
            .run();
        }
      }

      const [updated] = app.db
        .update(orders)
        .set({ status: newStatus, updatedAt: now })
        .where(eq(orders.id, id))
        .returning()
        .all();

      return { success: true, data: updated, error: null };
    },
  );
};
