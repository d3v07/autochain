import type { FastifyPluginAsync } from "fastify";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  customers,
  products,
  purchaseOrderLines,
  purchaseOrders,
  vendorCatalogItems,
  vendorInvoices,
  vendorProfiles,
  vendorShipments,
} from "@autochain/db";
import { PaginationParams } from "@autochain/shared";
import {
  getUser,
  requireAuth,
  requireVendorOrAdmin,
} from "../middleware/auth.js";

function resolveVendorCustomerId(
  auth: ReturnType<typeof getUser>,
  requested?: string,
) {
  if (auth.role === "admin") {
    return requested ? Number(requested) : null;
  }
  return auth.customerId;
}

function parseEvents(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const UpsertVendorShipment = z.object({
  trackingNumber: z.string().trim().min(3),
  carrier: z.string().trim().min(2),
  status: z.enum(["pending", "in_transit", "delivered", "delayed"]),
  estimatedDelivery: z.string().trim().nullable().optional(),
  note: z.string().trim().optional(),
  location: z.string().trim().optional(),
});

function vendorShipmentNote(
  status: z.infer<typeof UpsertVendorShipment>["status"],
) {
  switch (status) {
    case "in_transit":
      return "Freight departed and is currently in transit.";
    case "delivered":
      return "Shipment delivered to destination.";
    case "delayed":
      return "Shipment delayed and needs follow-up.";
    case "pending":
    default:
      return "Freight update recorded and awaiting movement.";
  }
}

export const vendorRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);
  app.addHook("preHandler", requireVendorOrAdmin);

  app.get("/", async (request) => {
    const auth = getUser(request);
    const { page, limit } = PaginationParams.parse(request.query);
    const offset = (page - 1) * limit;

    const vendorAccounts = app.db
      .select()
      .from(customers)
      .where(eq(customers.accountType, "vendor"))
      .all();

    const profiles = app.db.select().from(vendorProfiles).all();
    const orders = app.db.select().from(purchaseOrders).all();
    const invoices = app.db.select().from(vendorInvoices).all();
    const catalogItems = app.db.select().from(vendorCatalogItems).all();

    const profileByCustomerId = new Map(
      profiles.map((profile) => [profile.customerId, profile]),
    );

    const data = vendorAccounts
      .filter((account) =>
        auth.role === "admin" ? true : account.id === auth.customerId,
      )
      .map((account) => ({
        id: account.id,
        companyName: account.companyName,
        accountNumber: account.accountNumber,
        status: account.status,
        accountType: account.accountType,
        vendorProfile: profileByCustomerId.get(account.id) ?? null,
        openPurchaseOrders: orders.filter(
          (order) =>
            order.vendorCustomerId === account.id &&
            ["sent", "confirmed", "in_production", "shipped"].includes(
              order.status,
            ),
        ).length,
        pendingInvoices: invoices.filter(
          (invoice) =>
            invoice.vendorCustomerId === account.id &&
            ["pending", "approved", "disputed"].includes(invoice.status),
        ).length,
        constrainedCatalogItems: catalogItems.filter(
          (item) =>
            item.vendorCustomerId === account.id &&
            item.status === "constrained",
        ).length,
      }));

    return {
      success: true,
      data: data.slice(offset, offset + limit),
      meta: {
        total: data.length,
        page,
        limit,
        totalPages: Math.ceil(data.length / limit),
      },
      error: null,
    };
  });

  app.get("/dashboard", async (request, reply) => {
    const auth = getUser(request);
    const query = request.query as Record<string, string>;
    const vendorCustomerId = resolveVendorCustomerId(
      auth,
      query.vendorCustomerId,
    );

    if (!vendorCustomerId) {
      return reply.status(400).send({
        success: false,
        data: null,
        error: "vendorCustomerId is required for admin vendor views",
      });
    }

    const account = app.db
      .select()
      .from(customers)
      .where(eq(customers.id, vendorCustomerId))
      .get();

    if (!account || account.accountType !== "vendor") {
      return reply.status(404).send({
        success: false,
        data: null,
        error: "Vendor account not found",
      });
    }

    const profile = app.db
      .select()
      .from(vendorProfiles)
      .where(eq(vendorProfiles.customerId, vendorCustomerId))
      .get();

    if (!profile) {
      return reply.status(404).send({
        success: false,
        data: null,
        error: "Vendor profile not found",
      });
    }

    const purchaseOrderRows = app.db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.vendorCustomerId, vendorCustomerId))
      .orderBy(desc(purchaseOrders.updatedAt))
      .all();

    const invoiceRows = app.db
      .select()
      .from(vendorInvoices)
      .where(eq(vendorInvoices.vendorCustomerId, vendorCustomerId))
      .orderBy(desc(vendorInvoices.createdAt))
      .all();

    const catalogRows = app.db
      .select({
        id: vendorCatalogItems.id,
        vendorCustomerId: vendorCatalogItems.vendorCustomerId,
        productId: vendorCatalogItems.productId,
        vendorSku: vendorCatalogItems.vendorSku,
        unitCost: vendorCatalogItems.unitCost,
        minimumOrderQty: vendorCatalogItems.minimumOrderQty,
        leadTimeDays: vendorCatalogItems.leadTimeDays,
        availableQty: vendorCatalogItems.availableQty,
        status: vendorCatalogItems.status,
        updatedAt: vendorCatalogItems.updatedAt,
        productName: products.name,
        productCategory: products.category,
      })
      .from(vendorCatalogItems)
      .leftJoin(products, eq(vendorCatalogItems.productId, products.id))
      .where(eq(vendorCatalogItems.vendorCustomerId, vendorCustomerId))
      .orderBy(desc(vendorCatalogItems.updatedAt))
      .all();

    const shipmentRows = app.db
      .select()
      .from(vendorShipments)
      .all()
      .filter((shipment) =>
        purchaseOrderRows.some(
          (order) => order.id === shipment.purchaseOrderId,
        ),
      )
      .map((shipment) => ({
        ...shipment,
        events: parseEvents(shipment.events),
      }))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    const catalogValue = catalogRows.reduce(
      (sum, item) => sum + item.availableQty * item.unitCost,
      0,
    );

    return {
      success: true,
      data: {
        accountType: account.accountType,
        role: auth.role,
        companyName: account.companyName,
        accountNumber: account.accountNumber,
        vendorProfile: profile,
        metrics: {
          openPurchaseOrders: purchaseOrderRows.filter((order) =>
            ["sent", "confirmed", "in_production", "shipped"].includes(
              order.status,
            ),
          ).length,
          inTransitShipments: shipmentRows.filter(
            (shipment) => shipment.status === "in_transit",
          ).length,
          pendingInvoices: invoiceRows.filter((invoice) =>
            ["pending", "approved", "disputed"].includes(invoice.status),
          ).length,
          constrainedCatalogItems: catalogRows.filter(
            (item) => item.status === "constrained",
          ).length,
          catalogValue,
        },
        purchaseOrders: purchaseOrderRows.slice(0, 8),
        invoices: invoiceRows.slice(0, 8),
        shipments: shipmentRows.slice(0, 8),
        catalogItems: catalogRows.slice(0, 10),
      },
      error: null,
    };
  });

  app.get("/purchase-orders", async (request, reply) => {
    const auth = getUser(request);
    const query = request.query as Record<string, string>;
    const vendorCustomerId = resolveVendorCustomerId(
      auth,
      query.vendorCustomerId,
    );

    if (!vendorCustomerId) {
      return reply.status(400).send({
        success: false,
        data: null,
        error: "vendorCustomerId is required for admin vendor views",
      });
    }

    const rows = app.db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.vendorCustomerId, vendorCustomerId))
      .orderBy(desc(purchaseOrders.updatedAt))
      .all();

    const lines = app.db
      .select({
        purchaseOrderId: purchaseOrderLines.purchaseOrderId,
        productId: purchaseOrderLines.productId,
        quantity: purchaseOrderLines.quantity,
        unitCost: purchaseOrderLines.unitCost,
        lineTotal: purchaseOrderLines.lineTotal,
        productName: products.name,
        productSku: products.sku,
      })
      .from(purchaseOrderLines)
      .leftJoin(products, eq(purchaseOrderLines.productId, products.id))
      .all();

    return {
      success: true,
      data: rows.map((row) => ({
        ...row,
        lines: lines.filter((line) => line.purchaseOrderId === row.id),
      })),
      error: null,
    };
  });

  app.put<{ Params: { purchaseOrderId: string } }>(
    "/purchase-orders/:purchaseOrderId/shipment",
    async (request, reply) => {
      const auth = getUser(request);
      const purchaseOrderId = Number(request.params.purchaseOrderId);

      if (!Number.isFinite(purchaseOrderId)) {
        return reply.status(400).send({
          success: false,
          data: null,
          error: "Invalid purchase order id",
        });
      }

      const parsed = UpsertVendorShipment.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          data: null,
          error: "Invalid shipment update payload",
        });
      }

      const purchaseOrder = app.db
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, purchaseOrderId))
        .get();

      if (!purchaseOrder) {
        return reply.status(404).send({
          success: false,
          data: null,
          error: "Purchase order not found",
        });
      }

      if (
        auth.role !== "admin" &&
        purchaseOrder.vendorCustomerId !== auth.customerId
      ) {
        return reply.status(403).send({
          success: false,
          data: null,
          error: "Access denied",
        });
      }

      const {
        carrier,
        trackingNumber,
        status,
        estimatedDelivery,
        note,
        location,
      } = parsed.data;
      const timestamp = new Date().toISOString();
      const nextEvent = {
        status,
        description: note || vendorShipmentNote(status),
        location: location || undefined,
        timestamp,
      };

      const existingShipment = app.db
        .select()
        .from(vendorShipments)
        .where(eq(vendorShipments.purchaseOrderId, purchaseOrderId))
        .get();

      const existingEvents = existingShipment
        ? parseEvents(existingShipment.events)
        : [];
      const serializedEvents = JSON.stringify([...existingEvents, nextEvent]);

      const shipmentRow = existingShipment
        ? app.db
            .update(vendorShipments)
            .set({
              carrier,
              trackingNumber,
              status,
              estimatedDelivery: estimatedDelivery ?? null,
              events: serializedEvents,
            })
            .where(eq(vendorShipments.purchaseOrderId, purchaseOrderId))
            .returning()
            .get()
        : app.db
            .insert(vendorShipments)
            .values({
              purchaseOrderId,
              carrier,
              trackingNumber,
              status,
              estimatedDelivery: estimatedDelivery ?? null,
              events: serializedEvents,
            })
            .returning()
            .get();

      const purchaseOrderStatus =
        status === "delivered"
          ? "received"
          : status === "in_transit" || status === "delayed"
            ? "shipped"
            : purchaseOrder.status === "draft"
              ? "confirmed"
              : purchaseOrder.status;

      app.db
        .update(purchaseOrders)
        .set({
          status: purchaseOrderStatus,
          updatedAt: timestamp,
        })
        .where(eq(purchaseOrders.id, purchaseOrderId))
        .run();

      return {
        success: true,
        data: {
          ...shipmentRow,
          purchaseOrderStatus,
          events: parseEvents(shipmentRow!.events),
        },
        error: null,
      };
    },
  );

  app.get("/catalog", async (request, reply) => {
    const auth = getUser(request);
    const query = request.query as Record<string, string>;
    const vendorCustomerId = resolveVendorCustomerId(
      auth,
      query.vendorCustomerId,
    );

    if (!vendorCustomerId) {
      return reply.status(400).send({
        success: false,
        data: null,
        error: "vendorCustomerId is required for admin vendor views",
      });
    }

    const rows = app.db
      .select({
        id: vendorCatalogItems.id,
        vendorCustomerId: vendorCatalogItems.vendorCustomerId,
        productId: vendorCatalogItems.productId,
        vendorSku: vendorCatalogItems.vendorSku,
        unitCost: vendorCatalogItems.unitCost,
        minimumOrderQty: vendorCatalogItems.minimumOrderQty,
        leadTimeDays: vendorCatalogItems.leadTimeDays,
        availableQty: vendorCatalogItems.availableQty,
        status: vendorCatalogItems.status,
        updatedAt: vendorCatalogItems.updatedAt,
        productName: products.name,
        productCategory: products.category,
      })
      .from(vendorCatalogItems)
      .leftJoin(products, eq(vendorCatalogItems.productId, products.id))
      .where(eq(vendorCatalogItems.vendorCustomerId, vendorCustomerId))
      .orderBy(desc(vendorCatalogItems.updatedAt))
      .all();

    return { success: true, data: rows, error: null };
  });

  app.get("/invoices", async (request, reply) => {
    const auth = getUser(request);
    const query = request.query as Record<string, string>;
    const vendorCustomerId = resolveVendorCustomerId(
      auth,
      query.vendorCustomerId,
    );

    if (!vendorCustomerId) {
      return reply.status(400).send({
        success: false,
        data: null,
        error: "vendorCustomerId is required for admin vendor views",
      });
    }

    const rows = app.db
      .select()
      .from(vendorInvoices)
      .where(eq(vendorInvoices.vendorCustomerId, vendorCustomerId))
      .orderBy(desc(vendorInvoices.createdAt))
      .all();

    return { success: true, data: rows, error: null };
  });

  app.get("/shipments", async (request, reply) => {
    const auth = getUser(request);
    const query = request.query as Record<string, string>;
    const vendorCustomerId = resolveVendorCustomerId(
      auth,
      query.vendorCustomerId,
    );

    if (!vendorCustomerId) {
      return reply.status(400).send({
        success: false,
        data: null,
        error: "vendorCustomerId is required for admin vendor views",
      });
    }

    const orderIds = app.db
      .select({ id: purchaseOrders.id })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.vendorCustomerId, vendorCustomerId))
      .all()
      .map((row) => row.id);

    const rows = app.db
      .select()
      .from(vendorShipments)
      .all()
      .filter((shipment) => orderIds.includes(shipment.purchaseOrderId))
      .map((shipment) => ({
        ...shipment,
        events: parseEvents(shipment.events),
      }))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    return { success: true, data: rows, error: null };
  });
};
