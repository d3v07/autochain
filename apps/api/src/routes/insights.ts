import type { FastifyPluginAsync } from "fastify";
import { eq, desc, inArray, sql } from "drizzle-orm";
import {
  customers,
  customerPrices,
  type Db,
  orders,
  invoices,
  products,
  inventory,
  orderLines,
  shipments,
  vendorCatalogItems,
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

type VisualizationChartType = "histogram" | "pie";

interface VisualizationPoint {
  label: string;
  value: number;
  detail?: string;
  color?: string;
}

interface VisualizationResponse {
  prompt: string;
  title: string;
  chartType: VisualizationChartType;
  description: string;
  unit: "currency" | "count" | "percent";
  series: VisualizationPoint[];
}

const CHART_COLORS = [
  "#0f5132",
  "#2f855a",
  "#0ea5e9",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
];

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

  app.post("/visualization", async (request, reply) => {
    const { customerId, role } = getUser(request);
    const query = request.query as Record<string, string>;
    const { prompt } = (request.body ?? {}) as { prompt?: string };

    if (!prompt?.trim()) {
      return reply.status(400).send({
        success: false,
        data: null,
        error: "Prompt is required",
      });
    }

    const targetCustomerId =
      role === "admin"
        ? query.customerId
          ? Number(query.customerId)
          : customerId
        : customerId;

    const visualization = buildVisualizationForPrompt(
      app.db,
      targetCustomerId,
      prompt.trim(),
    );

    return {
      success: true,
      data: visualization,
      error: null,
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

function buildVisualizationForPrompt(
  db: Db,
  customerId: number,
  prompt: string,
): VisualizationResponse {
  const normalized = prompt.toLowerCase();

  if (
    normalized.includes("vendor") ||
    normalized.includes("supplier") ||
    normalized.includes("distribution") ||
    normalized.includes("share")
  ) {
    return buildVendorDistributionVisualization(db, customerId, prompt);
  }

  if (
    normalized.includes("delivery") ||
    normalized.includes("shipment") ||
    normalized.includes("tracking") ||
    normalized.includes("freight")
  ) {
    return buildDeliveryVisualization(db, customerId, prompt);
  }

  if (
    normalized.includes("saving") ||
    normalized.includes("savings") ||
    normalized.includes("compare") ||
    normalized.includes("month")
  ) {
    return buildSavingsVisualization(db, customerId, prompt);
  }

  return buildOrderTrendVisualization(db, customerId, prompt);
}

function buildSavingsVisualization(
  db: Db,
  customerId: number,
  prompt: string,
): VisualizationResponse {
  const overrides = db
    .select()
    .from(customerPrices)
    .where(eq(customerPrices.customerId, customerId))
    .all();

  const overrideByProductId = new Map(
    overrides.map((override) => [override.productId, override]),
  );

  const rows = db
    .select({
      createdAt: orders.createdAt,
      productId: orderLines.productId,
      quantity: orderLines.quantity,
      listUnitPrice: products.unitPrice,
    })
    .from(orderLines)
    .leftJoin(orders, eq(orderLines.orderId, orders.id))
    .leftJoin(products, eq(orderLines.productId, products.id))
    .where(eq(orders.customerId, customerId))
    .all();

  const buckets = createMonthlyBuckets(6);

  for (const row of rows) {
    if (!row.createdAt || row.listUnitPrice === null) continue;
    const monthKey = toMonthKey(row.createdAt);
    if (!buckets.has(monthKey)) continue;

    const override = overrideByProductId.get(row.productId);
    const baseline = row.listUnitPrice * row.quantity;
    const effectiveUnitPrice = override
      ? (override.customPrice ??
        row.listUnitPrice * (1 - (override.discountPct ?? 0) / 100))
      : row.listUnitPrice;
    const savings = Math.max(0, baseline - effectiveUnitPrice * row.quantity);
    buckets.set(monthKey, (buckets.get(monthKey) ?? 0) + savings);
  }

  return {
    prompt,
    title: "Contract Savings Opportunity",
    chartType: "histogram",
    description:
      "Estimated monthly savings based on current customer pricing versus list pricing.",
    unit: "currency",
    series: Array.from(buckets.entries()).map(([key, value]) => ({
      label: toMonthLabel(key),
      value: roundCurrency(value),
      detail: value
        ? `$${roundCurrency(value).toLocaleString("en-US", { minimumFractionDigits: 2 })} saved`
        : "No savings recorded",
    })),
  };
}

function buildVendorDistributionVisualization(
  db: Db,
  customerId: number,
  prompt: string,
): VisualizationResponse {
  const orderRows = db
    .select({
      createdAt: orders.createdAt,
      productId: orderLines.productId,
      lineTotal: orderLines.lineTotal,
    })
    .from(orderLines)
    .leftJoin(orders, eq(orderLines.orderId, orders.id))
    .where(eq(orders.customerId, customerId))
    .all();

  const vendorMaps = db.select().from(vendorCatalogItems).all();
  const vendorAccounts = db
    .select({
      id: customers.id,
      companyName: customers.companyName,
      accountType: customers.accountType,
    })
    .from(customers)
    .all()
    .filter((customer) => customer.accountType === "vendor");

  const vendorNameById = new Map(
    vendorAccounts.map((vendor) => [vendor.id, vendor.companyName]),
  );
  const vendorByProductId = new Map<number, string>();

  for (const row of vendorMaps) {
    if (!vendorByProductId.has(row.productId)) {
      vendorByProductId.set(
        row.productId,
        vendorNameById.get(row.vendorCustomerId) ?? "Unassigned vendor",
      );
    }
  }

  const totals = new Map<string, number>();

  for (const row of orderRows) {
    const vendorName =
      vendorByProductId.get(row.productId) ?? "Unassigned vendor";
    totals.set(vendorName, (totals.get(vendorName) ?? 0) + row.lineTotal);
  }

  const ranked = Array.from(totals.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6);

  return {
    prompt,
    title: "Vendor Spend Distribution",
    chartType: "pie",
    description:
      "Share of order value routed through each vendor across current product sourcing.",
    unit: "currency",
    series: ranked.map(([label, value], index) => ({
      label,
      value: roundCurrency(value),
      detail: `$${roundCurrency(value).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
      color: CHART_COLORS[index % CHART_COLORS.length],
    })),
  };
}

function buildDeliveryVisualization(
  db: Db,
  customerId: number,
  prompt: string,
): VisualizationResponse {
  const customerOrderIds = db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.customerId, customerId))
    .all()
    .map((row) => row.id);

  const shipmentRows =
    customerOrderIds.length > 0
      ? db
          .select({
            orderId: shipments.orderId,
            status: shipments.status,
            trackingNumber: shipments.trackingNumber,
          })
          .from(shipments)
          .where(inArray(shipments.orderId, customerOrderIds))
          .all()
      : [];

  const statusOrder = ["pending", "in_transit", "delivered", "exception"];
  const counts = new Map(statusOrder.map((status) => [status, 0]));

  for (const shipment of shipmentRows) {
    counts.set(shipment.status, (counts.get(shipment.status) ?? 0) + 1);
  }

  return {
    prompt,
    title: "Freight Status Overview",
    chartType: "histogram",
    description:
      "Current shipment mix across pending, active, delivered, and delayed freight lanes.",
    unit: "count",
    series: statusOrder.map((status, index) => ({
      label: status.replace("_", " "),
      value: counts.get(status) ?? 0,
      detail:
        status === "in_transit"
          ? "Active freight lanes"
          : `${counts.get(status) ?? 0} shipment${counts.get(status) === 1 ? "" : "s"}`,
      color: CHART_COLORS[index % CHART_COLORS.length],
    })),
  };
}

function buildOrderTrendVisualization(
  db: Db,
  customerId: number,
  prompt: string,
): VisualizationResponse {
  const rows = db
    .select({
      createdAt: orders.createdAt,
      total: orders.total,
    })
    .from(orders)
    .where(eq(orders.customerId, customerId))
    .all();

  const buckets = createMonthlyBuckets(6);

  for (const row of rows) {
    const monthKey = toMonthKey(row.createdAt);
    if (!buckets.has(monthKey)) continue;
    buckets.set(monthKey, (buckets.get(monthKey) ?? 0) + row.total);
  }

  return {
    prompt,
    title: "Order Value Trend",
    chartType: "histogram",
    description:
      "Recent order value by month for quick trend comparisons when the prompt is broad.",
    unit: "currency",
    series: Array.from(buckets.entries()).map(([key, value]) => ({
      label: toMonthLabel(key),
      value: roundCurrency(value),
      detail: `$${roundCurrency(value).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
    })),
  };
}

function createMonthlyBuckets(monthCount: number) {
  const buckets = new Map<string, number>();
  const anchor = new Date();
  anchor.setDate(1);
  anchor.setHours(0, 0, 0, 0);

  for (let index = monthCount - 1; index >= 0; index -= 1) {
    const point = new Date(anchor);
    point.setMonth(point.getMonth() - index);
    buckets.set(point.toISOString().slice(0, 7), 0);
  }

  return buckets;
}

function toMonthKey(input: string) {
  return new Date(input).toISOString().slice(0, 7);
}

function toMonthLabel(monthKey: string) {
  const date = new Date(`${monthKey}-01T00:00:00Z`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  });
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
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
