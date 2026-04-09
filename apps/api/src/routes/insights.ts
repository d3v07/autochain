import type { FastifyPluginAsync } from "fastify";
import { eq, desc, sql } from "drizzle-orm";
import {
  orders,
  invoices,
  products,
  inventory,
  orderLines,
} from "@autochain/db";
import {
  requireAuth,
  getUser,
  requireClientOrAdmin,
} from "../middleware/auth.js";

const CACHE_TTL_MS = 15 * 60 * 1000;
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:7b";
const INSIGHTS_AI_COMMENTARY = process.env.INSIGHTS_AI_COMMENTARY === "true";

type InsightCategory =
  | "operations"
  | "inventory"
  | "financial"
  | "recommendations";
type InsightSeverity = "info" | "warning" | "critical";

interface Insight {
  id: string;
  category: InsightCategory;
  title: string;
  text: string;
  severity: InsightSeverity;
  action?: string;
}

const cache = new Map<
  string,
  {
    expiresAt: number;
    data: Insight[];
  }
>();

export const insightsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);
  app.addHook("preHandler", requireClientOrAdmin);

  app.get("/", async (request) => {
    const { customerId, role } = getUser(request);
    const query = request.query as Record<string, string>;

    const targetCustomerId =
      role === "admin"
        ? query.customerId
          ? Number(query.customerId)
          : null
        : customerId;

    const cacheKey =
      targetCustomerId === null ? "all" : String(targetCustomerId);
    const cached = cache.get(cacheKey);
    const now = Date.now();

    if (cached && cached.expiresAt > now) {
      return {
        success: true,
        data: cached.data,
        error: null,
        meta: {
          cached: true,
          expiresAt: new Date(cached.expiresAt).toISOString(),
        },
      };
    }

    let ordersQuery = app.db
      .select({
        id: orders.id,
        status: orders.status,
        total: orders.total,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .$dynamic();

    let invoicesQuery = app.db
      .select({
        id: invoices.id,
        amount: invoices.amount,
        status: invoices.status,
        dueDate: invoices.dueDate,
      })
      .from(invoices)
      .$dynamic();

    if (targetCustomerId !== null) {
      ordersQuery = ordersQuery.where(eq(orders.customerId, targetCustomerId));
      invoicesQuery = invoicesQuery.where(
        eq(invoices.customerId, targetCustomerId),
      );
    }

    const orderRows = ordersQuery.orderBy(desc(orders.createdAt)).all();
    const invoiceRows = invoicesQuery.orderBy(desc(invoices.createdAt)).all();

    const productRows = app.db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        quantityAvailable: inventory.quantityAvailable,
      })
      .from(products)
      .leftJoin(inventory, eq(products.id, inventory.productId))
      .all();

    let topProductsQuery = app.db
      .select({
        productId: orderLines.productId,
        name: products.name,
        sku: products.sku,
        totalQty: sql<number>`sum(${orderLines.quantity})`,
      })
      .from(orderLines)
      .leftJoin(orders, eq(orderLines.orderId, orders.id))
      .leftJoin(products, eq(orderLines.productId, products.id))
      .$dynamic();

    if (targetCustomerId !== null) {
      topProductsQuery = topProductsQuery.where(
        eq(orders.customerId, targetCustomerId),
      );
    }

    const topProducts = topProductsQuery
      .groupBy(orderLines.productId, products.name, products.sku)
      .orderBy(desc(sql`sum(${orderLines.quantity})`))
      .limit(3)
      .all();

    const insights = buildInsights(
      orderRows,
      invoiceRows,
      productRows,
      topProducts,
    );

    if (INSIGHTS_AI_COMMENTARY) {
      const commentary = await generateAiCommentary({
        orderCount: orderRows.length,
        pendingOrders: orderRows.filter(
          (o) => o.status === "confirmed" || o.status === "processing",
        ).length,
        overdueInvoiceCount: invoiceRows.filter((i) => i.status === "overdue")
          .length,
        lowStockCount: productRows.filter(
          (p) =>
            (p.quantityAvailable ?? 0) > 0 && (p.quantityAvailable ?? 0) <= 50,
        ).length,
      });

      if (commentary) {
        insights.unshift({
          id: "ops-ai-summary",
          category: "operations",
          title: "AI Summary",
          text: commentary,
          severity: "info",
          action: "Summarize my account activity this month",
        });
      }
    }

    cache.set(cacheKey, { data: insights, expiresAt: now + CACHE_TTL_MS });

    return {
      success: true,
      data: insights,
      error: null,
      meta: {
        cached: false,
        expiresAt: new Date(now + CACHE_TTL_MS).toISOString(),
      },
    };
  });
};

function buildInsights(
  ordersData: Array<{ status: string; total: number; createdAt: string }>,
  invoicesData: Array<{ amount: number; status: string; dueDate: string }>,
  productsData: Array<{
    id: number;
    name: string;
    sku: string;
    quantityAvailable: number | null;
  }>,
  topProducts: Array<{
    productId: number;
    name: string | null;
    sku: string | null;
    totalQty: number;
  }>,
): Insight[] {
  const insights: Insight[] = [];

  const pendingOrders = ordersData.filter(
    (o) => o.status === "confirmed" || o.status === "processing",
  );
  if (pendingOrders.length > 0) {
    const pendingValue = pendingOrders.reduce((sum, o) => sum + o.total, 0);
    insights.push({
      id: "ops-pending-orders",
      category: "operations",
      title: `${pendingOrders.length} orders awaiting fulfillment`,
      text: `Pending order value is $${pendingValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}.`,
      severity: pendingOrders.length >= 5 ? "warning" : "info",
      action: "Show orders pending shipment",
    });
  }

  if (ordersData.length >= 3) {
    const avgOrder =
      ordersData.reduce((sum, o) => sum + o.total, 0) / ordersData.length;
    insights.push({
      id: "ops-average-order",
      category: "operations",
      title: "Average order value trend",
      text: `Average order value is $${avgOrder.toLocaleString("en-US", { minimumFractionDigits: 2 })} across ${ordersData.length} orders.`,
      severity: "info",
      action: "Analyze my order trends",
    });
  }

  const overdueInvoices = invoicesData.filter((i) => i.status === "overdue");
  if (overdueInvoices.length > 0) {
    const overdueTotal = overdueInvoices.reduce((sum, i) => sum + i.amount, 0);
    insights.push({
      id: "fin-overdue",
      category: "financial",
      title: `$${overdueTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })} overdue balance`,
      text: `${overdueInvoices.length} overdue invoice${overdueInvoices.length > 1 ? "s" : ""} need attention.`,
      severity: overdueInvoices.length >= 2 ? "critical" : "warning",
      action: "Show overdue invoices",
    });
  }

  const pendingInvoices = invoicesData.filter((i) => i.status === "pending");
  if (pendingInvoices.length > 0) {
    const pendingTotal = pendingInvoices.reduce((sum, i) => sum + i.amount, 0);
    insights.push({
      id: "fin-pending",
      category: "financial",
      title: `$${pendingTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })} in upcoming payments`,
      text: `${pendingInvoices.length} invoice${pendingInvoices.length > 1 ? "s are" : " is"} pending payment.`,
      severity: "info",
      action: "When are my next payments due?",
    });
  }

  const lowStock = productsData.filter((p) => {
    const qty = p.quantityAvailable ?? 0;
    return qty > 0 && qty <= 50;
  });
  if (lowStock.length > 0) {
    const names = lowStock
      .slice(0, 3)
      .map((p) => p.name)
      .join(", ");
    insights.push({
      id: "inv-low-stock",
      category: "inventory",
      title: `${lowStock.length} products below reorder threshold`,
      text: `${names}${lowStock.length > 3 ? ` and ${lowStock.length - 3} more` : ""}.`,
      severity: lowStock.length >= 5 ? "warning" : "info",
      action: "Find low-stock items",
    });
  }

  const outOfStock = productsData.filter(
    (p) => (p.quantityAvailable ?? 0) === 0,
  );
  if (outOfStock.length > 0) {
    const skus = outOfStock
      .slice(0, 3)
      .map((p) => p.sku)
      .join(", ");
    insights.push({
      id: "inv-out-of-stock",
      category: "inventory",
      title: `${outOfStock.length} products are out of stock`,
      text: `${skus}${outOfStock.length > 3 ? ` and ${outOfStock.length - 3} more` : ""}.`,
      severity: outOfStock.length >= 3 ? "critical" : "warning",
      action: "What alternatives are in stock?",
    });
  }

  if (topProducts.length > 0) {
    const item = topProducts[0]!;
    const label = item.name ?? item.sku ?? `Product ${item.productId}`;
    insights.push({
      id: "rec-top-product",
      category: "recommendations",
      title: "Reorder recommendation",
      text: `${label} is your most frequently ordered item recently (${item.totalQty} units).`,
      severity: "info",
      action: `Should I reorder ${label}?`,
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: "ops-no-data",
      category: "operations",
      title: "No insights yet",
      text: "More activity is needed before operational insights can be generated.",
      severity: "info",
      action: "How can I generate more insights?",
    });
  }

  return insights;
}

async function generateAiCommentary(summary: {
  orderCount: number;
  pendingOrders: number;
  overdueInvoiceCount: number;
  lowStockCount: number;
}): Promise<string | null> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        options: { temperature: 0.2, num_predict: 120 },
        messages: [
          {
            role: "system",
            content:
              "You are an operations analyst. Write one concise insight summary for a B2B customer dashboard.",
          },
          {
            role: "user",
            content: `Orders: ${summary.orderCount}, Pending orders: ${summary.pendingOrders}, Overdue invoices: ${summary.overdueInvoiceCount}, Low stock products: ${summary.lowStockCount}. Provide 1-2 sentences with one suggested action.`,
          },
        ],
      }),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content?.trim() || null;
  } catch {
    return null;
  }
}
