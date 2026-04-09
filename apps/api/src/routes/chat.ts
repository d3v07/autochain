import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { eq, desc, and, like, or } from "drizzle-orm";
import type { Db } from "@autochain/db";
import {
  assistantSessions,
  products,
  inventory,
  orders,
  invoices,
  customers,
  orderLines,
  purchaseOrders,
  userSessions,
  auditLogs,
  memoryItems,
  vendorCatalogItems,
  vendorInvoices,
  vendorProfiles,
  vendorShipments,
} from "@autochain/db";
import { requireAuth, getUser } from "../middleware/auth.js";
import {
  addAssistantEntry,
  createAssistantSession,
  getAssistantSessionById,
} from "../lib/assistant-sessions.js";
import { recordChatCache } from "../lib/chat-cache.js";
import {
  AGENTIC_SAFETY_PROMPT,
  GLOBAL_SYSTEM_PROMPT,
  getAutonomyPrompt,
  getModePrompt,
  getRolePrompt,
} from "../lib/prompt-pack.js";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:7b";

interface ChatRequest {
  message: string;
  history?: { role: string; content: string }[];
  sessionId?: number;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
}

interface OllamaStreamChunk {
  message?: { content?: string };
  done?: boolean;
  error?: string;
}

interface OllamaChatResponse {
  message?: {
    content?: string;
    tool_calls?: Array<{
      function?: {
        name?: string;
        arguments?: unknown;
      };
    }>;
  };
}

export const chatRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  app.post<{ Body: ChatRequest }>("/", async (request, reply) => {
    const message = request.body?.message?.trim();
    const history = Array.isArray(request.body?.history)
      ? request.body.history
      : [];
    const requestedSessionId =
      typeof request.body?.sessionId === "number" &&
      Number.isInteger(request.body.sessionId)
        ? request.body.sessionId
        : null;

    if (!message) {
      return reply.status(400).send({
        success: false,
        data: null,
        error: "Message is required",
      });
    }

    const user = getUser(request);
    const session =
      (requestedSessionId
        ? getAssistantSessionById(app.db, {
            sessionId: requestedSessionId,
            role: user.role,
            userId: user.userId,
            customerId: user.customerId,
          })
        : null) ??
      createAssistantSession({
        db: app.db,
        customerId: user.customerId,
        userId: user.userId,
        role: user.role,
        mode: "text",
        title: "Text conversation",
        sourcePage: "/assistant",
      });

    addAssistantEntry({
      db: app.db,
      sessionId: session.id,
      role: "user",
      entryType: "message",
      content: message,
      metadata: {
        sourceMode: user.mode,
      },
    });

    const context =
      user.role === "admin"
        ? await gatherAdminContext(app.db)
        : user.role === "vendor"
          ? await gatherVendorContext(app.db, user.customerId, message)
          : await gatherContext(app.db, user.customerId, message);

    const promptSections = [
      GLOBAL_SYSTEM_PROMPT,
      getRolePrompt(user.role),
      getModePrompt(user.mode),
      getAutonomyPrompt(user.autonomy),
      user.mode === "agentic" ? AGENTIC_SAFETY_PROMPT : null,
      `Current operating context:\n${context}`,
      `Guidelines:
- Be concise and specific. Use numbers and data from the context.
- Format currency as $X,XXX.XX
- When listing items in text mode, use bullet points when useful.
- If asked about something not in the context, say so honestly.
- Never make up order numbers, prices, user records, or platform metrics.
- Respect role boundaries and customer data isolation at all times.`,
    ].filter(Boolean);

    const systemPrompt = promptSections.join("\n\n");

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...history.slice(-10).map<ChatMessage>((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
      { role: "user" as const, content: message },
    ];

    beginSse(reply, request.headers.origin);
    const abortController = new AbortController();
    reply.raw.on("close", () => abortController.abort());

    try {
      const finalMessages =
        user.role === "customer"
          ? await resolveMessagesWithToolCalls(
              app.db,
              user.customerId,
              messages,
              abortController.signal,
            )
          : messages;
      const response = await streamOllamaToSse(
        finalMessages,
        reply,
        abortController.signal,
      );

      if (!abortController.signal.aborted) {
        addAssistantEntry({
          db: app.db,
          sessionId: session.id,
          role: "assistant",
          entryType: "message",
          content: response || "No response returned.",
          metadata: {
            sourceMode: user.mode,
          },
        });
        recordChatCache({
          db: app.db,
          customerId: user.customerId,
          userId: user.userId,
          sessionId: session.id,
          role: user.role,
          sourceMode: user.mode,
          prompt: message,
          response: response || "No response returned.",
        });
      }
    } catch (err) {
      request.log.error(err, "Failed to reach Ollama");
      if (!abortController.signal.aborted) {
        writeSse(
          reply,
          JSON.stringify({
            error:
              "Cannot connect to AI service. Make sure Ollama is running (ollama serve).",
          }),
        );
      }
    } finally {
      if (!reply.raw.writableEnded) {
        writeSse(reply, "[DONE]");
        reply.raw.end();
      }
    }
  });
};

function beginSse(reply: FastifyReply, origin?: string) {
  reply.hijack();
  reply.raw.statusCode = 200;
  if (origin) {
    reply.raw.setHeader("Access-Control-Allow-Origin", origin);
    reply.raw.setHeader("Vary", "Origin");
  }
  reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
  reply.raw.setHeader("Connection", "keep-alive");
  reply.raw.setHeader("X-Accel-Buffering", "no");
  reply.raw.flushHeaders();
}

function writeSse(reply: FastifyReply, data: string) {
  if (!reply.raw.writableEnded) {
    reply.raw.write(`data: ${data}\n\n`);
  }
}

function buildToolDefinitions() {
  return [
    {
      type: "function",
      function: {
        name: "query_orders",
        description: "Fetch recent customer orders filtered by status",
        parameters: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: [
                "draft",
                "confirmed",
                "processing",
                "shipped",
                "delivered",
                "cancelled",
              ],
            },
            limit: { type: "integer", minimum: 1, maximum: 50 },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "query_products",
        description: "Search product catalog and inventory information",
        parameters: {
          type: "object",
          properties: {
            category: {
              type: "string",
              enum: [
                "windows",
                "doors",
                "hardware",
                "glass",
                "weatherstripping",
                "frames",
                "accessories",
              ],
            },
            search: { type: "string" },
            low_stock_only: { type: "boolean" },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "query_invoices",
        description: "Fetch customer invoices filtered by status",
        parameters: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["pending", "paid", "overdue"] },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_order_detail",
        description: "Fetch a single order and its line items by order number",
        parameters: {
          type: "object",
          properties: {
            order_number: { type: "string" },
          },
          required: ["order_number"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_inventory_alerts",
        description: "List products below or near reorder threshold",
        parameters: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "calculate_reorder",
        description:
          "Suggest reorder quantity for a product using recent order history",
        parameters: {
          type: "object",
          properties: {
            product_id: { type: "integer" },
          },
          required: ["product_id"],
          additionalProperties: false,
        },
      },
    },
  ] as const;
}

function parseToolArguments(args: unknown): Record<string, unknown> {
  if (typeof args === "string") {
    try {
      const parsed = JSON.parse(args);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
    return {};
  }

  if (args && typeof args === "object" && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }

  return {};
}

function normalizeToolCalls(
  rawCalls: NonNullable<OllamaChatResponse["message"]>["tool_calls"] = [],
): ToolCall[] {
  const normalized: ToolCall[] = [];

  for (const rawCall of rawCalls) {
    const name = rawCall.function?.name;
    if (!name) continue;

    normalized.push({
      function: {
        name,
        arguments: parseToolArguments(rawCall.function?.arguments),
      },
    });
  }

  return normalized;
}

async function requestToolPlanningStep(
  messages: OllamaMessage[],
  signal: AbortSignal,
) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      tools: buildToolDefinitions(),
      stream: false,
      options: { temperature: 0.1, num_predict: 300 },
    }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama tool planning error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as OllamaChatResponse;
  if (!data.message) {
    throw new Error("Invalid tool planning response from Ollama");
  }

  return data.message;
}

async function resolveMessagesWithToolCalls(
  db: Db,
  customerId: number,
  baseMessages: ChatMessage[],
  signal: AbortSignal,
): Promise<OllamaMessage[]> {
  const messages: OllamaMessage[] = [...baseMessages];
  let usedTools = false;

  for (let attempt = 0; attempt < 4; attempt++) {
    const planningMessage = await requestToolPlanningStep(messages, signal);
    const toolCalls = normalizeToolCalls(planningMessage.tool_calls);

    if (toolCalls.length === 0) {
      if (!usedTools) {
        return messages;
      }
      return [
        ...messages,
        {
          role: "system",
          content:
            "Use the provided tool results to answer the user's latest question. Do not call more tools.",
        },
      ];
    }

    usedTools = true;
    messages.push({
      role: "assistant",
      content: planningMessage.content ?? "",
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      const result = executeToolCall(db, customerId, call);
      messages.push({
        role: "tool",
        content: JSON.stringify({
          tool: call.function.name,
          arguments: call.function.arguments,
          result,
        }),
      });
    }
  }

  return [
    ...messages,
    {
      role: "system",
      content:
        "Answer the user with the available tool results in a concise, actionable way.",
    },
  ];
}

function getStringArg(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = args[key];
  return typeof value === "string" ? value : undefined;
}

function getBooleanArg(
  args: Record<string, unknown>,
  key: string,
  fallback = false,
): boolean {
  const value = args[key];
  if (typeof value === "boolean") return value;
  return fallback;
}

function getIntArg(
  args: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = args[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function executeToolCall(db: Db, customerId: number, toolCall: ToolCall) {
  const { name, arguments: args } = toolCall.function;

  switch (name) {
    case "query_orders":
      return queryOrdersTool(db, customerId, args);
    case "query_products":
      return queryProductsTool(db, args);
    case "query_invoices":
      return queryInvoicesTool(db, customerId, args);
    case "get_order_detail":
      return getOrderDetailTool(db, customerId, args);
    case "get_inventory_alerts":
      return getInventoryAlertsTool(db);
    case "calculate_reorder":
      return calculateReorderTool(db, customerId, args);
    default:
      return { error: `Unknown tool '${name}'` };
  }
}

function queryOrdersTool(
  db: Db,
  customerId: number,
  args: Record<string, unknown>,
) {
  const statusArg = getStringArg(args, "status");
  const status =
    statusArg &&
    [
      "draft",
      "confirmed",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
    ].includes(statusArg)
      ? (statusArg as (typeof orders.status.enumValues)[number])
      : undefined;
  const limit = Math.max(1, Math.min(50, getIntArg(args, "limit", 10)));

  const whereCondition = status
    ? and(eq(orders.customerId, customerId), eq(orders.status, status))
    : eq(orders.customerId, customerId);

  const data = db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      total: orders.total,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
    })
    .from(orders)
    .where(whereCondition)
    .orderBy(desc(orders.createdAt))
    .limit(limit)
    .all();

  return { count: data.length, orders: data };
}

function queryProductsTool(db: Db, args: Record<string, unknown>) {
  const categoryArg = getStringArg(args, "category");
  const category =
    categoryArg &&
    [
      "windows",
      "doors",
      "hardware",
      "glass",
      "weatherstripping",
      "frames",
      "accessories",
    ].includes(categoryArg)
      ? (categoryArg as (typeof products.category.enumValues)[number])
      : undefined;
  const search = getStringArg(args, "search");
  const lowStockOnly = getBooleanArg(args, "low_stock_only");

  let query = db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      category: products.category,
      unitPrice: products.unitPrice,
      quantityAvailable: inventory.quantityAvailable,
      quantityReserved: inventory.quantityReserved,
    })
    .from(products)
    .leftJoin(inventory, eq(products.id, inventory.productId))
    .$dynamic();

  if (category) {
    query = query.where(eq(products.category, category));
  }
  if (search) {
    query = query.where(
      or(like(products.name, `%${search}%`), like(products.sku, `%${search}%`)),
    );
  }

  const rows = query.limit(40).all();
  const filtered = lowStockOnly
    ? rows.filter((row) => (row.quantityAvailable ?? 0) <= 50)
    : rows;

  return { count: filtered.length, products: filtered };
}

function queryInvoicesTool(
  db: Db,
  customerId: number,
  args: Record<string, unknown>,
) {
  const statusArg = getStringArg(args, "status");
  const status =
    statusArg && ["pending", "paid", "overdue"].includes(statusArg)
      ? (statusArg as (typeof invoices.status.enumValues)[number])
      : undefined;

  const whereCondition = status
    ? and(eq(invoices.customerId, customerId), eq(invoices.status, status))
    : eq(invoices.customerId, customerId);

  const data = db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      amount: invoices.amount,
      status: invoices.status,
      dueDate: invoices.dueDate,
      paidAt: invoices.paidAt,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .where(whereCondition)
    .orderBy(desc(invoices.createdAt))
    .all();

  return { count: data.length, invoices: data };
}

function getOrderDetailTool(
  db: Db,
  customerId: number,
  args: Record<string, unknown>,
) {
  const orderNumber = getStringArg(args, "order_number");
  if (!orderNumber) {
    return { error: "order_number is required" };
  }

  const order = db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      total: orders.total,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
    })
    .from(orders)
    .where(
      and(
        eq(orders.customerId, customerId),
        eq(orders.orderNumber, orderNumber),
      ),
    )
    .get();

  if (!order) {
    return { error: `Order '${orderNumber}' not found` };
  }

  const lines = db
    .select({
      productId: orderLines.productId,
      quantity: orderLines.quantity,
      unitPrice: orderLines.unitPrice,
      lineTotal: orderLines.lineTotal,
      productName: products.name,
      productSku: products.sku,
    })
    .from(orderLines)
    .leftJoin(products, eq(orderLines.productId, products.id))
    .where(eq(orderLines.orderId, order.id))
    .all();

  return { order, lines };
}

function getInventoryAlertsTool(db: Db) {
  const rows = db
    .select({
      productId: products.id,
      sku: products.sku,
      name: products.name,
      quantityAvailable: inventory.quantityAvailable,
      quantityReserved: inventory.quantityReserved,
    })
    .from(products)
    .leftJoin(inventory, eq(products.id, inventory.productId))
    .all()
    .filter((row) => (row.quantityAvailable ?? 0) <= 50)
    .sort((a, b) => (a.quantityAvailable ?? 0) - (b.quantityAvailable ?? 0))
    .slice(0, 25);

  return { count: rows.length, alerts: rows };
}

function calculateReorderTool(
  db: Db,
  customerId: number,
  args: Record<string, unknown>,
) {
  const productId = getIntArg(args, "product_id", 0);
  if (productId <= 0) {
    return { error: "product_id must be a positive integer" };
  }

  const product = db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      unitPrice: products.unitPrice,
    })
    .from(products)
    .where(eq(products.id, productId))
    .get();

  if (!product) {
    return { error: `Product '${productId}' not found` };
  }

  const stock = db
    .select({
      quantityAvailable: inventory.quantityAvailable,
      quantityReserved: inventory.quantityReserved,
    })
    .from(inventory)
    .where(eq(inventory.productId, productId))
    .get();

  const history = db
    .select({
      quantity: orderLines.quantity,
      createdAt: orders.createdAt,
    })
    .from(orderLines)
    .leftJoin(orders, eq(orderLines.orderId, orders.id))
    .where(
      and(
        eq(orderLines.productId, productId),
        eq(orders.customerId, customerId),
      ),
    )
    .all();

  const cutoffMs = Date.now() - 90 * 24 * 60 * 60 * 1000;
  let quantityLast90Days = 0;

  for (const row of history) {
    const createdAtMs = row.createdAt ? Date.parse(row.createdAt) : Number.NaN;
    if (Number.isFinite(createdAtMs) && createdAtMs >= cutoffMs) {
      quantityLast90Days += row.quantity;
    }
  }

  const avgDailyDemand = quantityLast90Days / 90;
  const leadTimeDays = 21;
  const safetyStock = Math.max(20, Math.round(avgDailyDemand * 14));
  const targetStock = Math.round(avgDailyDemand * leadTimeDays + safetyStock);
  const onHand = stock?.quantityAvailable ?? 0;
  const reorderQuantity = Math.max(0, targetStock - onHand);

  return {
    product,
    metrics: {
      quantityLast90Days,
      avgDailyDemand: Number(avgDailyDemand.toFixed(2)),
      leadTimeDays,
      safetyStock,
      targetStock,
      onHand,
      reserved: stock?.quantityReserved ?? 0,
    },
    recommendation: {
      reorderQuantity,
      rationale:
        reorderQuantity > 0
          ? "Recommended to cover estimated lead-time demand plus safety stock."
          : "Current stock is sufficient for estimated lead-time demand.",
    },
  };
}

async function streamOllamaToSse(
  messages: OllamaMessage[],
  reply: FastifyReply,
  signal: AbortSignal,
) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      stream: true,
      options: { temperature: 0.3, num_predict: 500 },
    }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }
  if (!res.body) {
    throw new Error("Ollama did not return a readable stream");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalContent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    let newlineIndex = buffer.indexOf("\n");

    while (newlineIndex !== -1) {
      const rawLine = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (rawLine) {
        const chunk = JSON.parse(rawLine) as OllamaStreamChunk;
        if (chunk.error) {
          throw new Error(chunk.error);
        }
        if (chunk.message?.content) {
          finalContent += chunk.message.content;
          writeSse(reply, JSON.stringify({ token: chunk.message.content }));
        }
        if (chunk.done) {
          return finalContent;
        }
      }

      newlineIndex = buffer.indexOf("\n");
    }
  }

  if (buffer.trim()) {
    const chunk = JSON.parse(buffer.trim()) as OllamaStreamChunk;
    if (chunk.error) {
      throw new Error(chunk.error);
    }
    if (chunk.message?.content) {
      finalContent += chunk.message.content;
      writeSse(reply, JSON.stringify({ token: chunk.message.content }));
    }
  }

  return finalContent;
}

async function gatherContext(
  db: Db,
  customerId: number,
  message: string,
): Promise<string> {
  const sections: string[] = [];
  const msgLower = message.toLowerCase();

  // Always include customer info
  const customer = db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .get();

  if (customer) {
    sections.push(
      `Customer: ${customer.companyName} (${customer.accountNumber}), ${customer.city}, ${customer.state}`,
    );
  }

  // Orders context
  const recentOrders = db
    .select()
    .from(orders)
    .where(eq(orders.customerId, customerId))
    .orderBy(desc(orders.createdAt))
    .limit(10)
    .all();

  if (recentOrders.length > 0) {
    const orderSummary = recentOrders.map(
      (o) =>
        `  - ${o.orderNumber}: ${o.status}, $${o.total.toFixed(2)}, ${o.createdAt}`,
    );
    sections.push(
      `Recent Orders (${recentOrders.length}):\n${orderSummary.join("\n")}`,
    );

    const statusCounts: Record<string, number> = {};
    for (const o of recentOrders) {
      statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1;
    }
    sections.push(
      `Order Status Breakdown: ${Object.entries(statusCounts)
        .map(([s, c]) => `${s}: ${c}`)
        .join(", ")}`,
    );
  }

  // Invoice context
  const customerInvoices = db
    .select()
    .from(invoices)
    .where(eq(invoices.customerId, customerId))
    .orderBy(desc(invoices.createdAt))
    .all();

  if (customerInvoices.length > 0) {
    const overdue = customerInvoices.filter((i) => i.status === "overdue");
    const pending = customerInvoices.filter((i) => i.status === "pending");
    const totalOwed = [...overdue, ...pending].reduce(
      (s, i) => s + i.amount,
      0,
    );

    sections.push(
      `Invoices: ${customerInvoices.length} total, ${overdue.length} overdue, ${pending.length} pending, $${totalOwed.toFixed(2)} outstanding`,
    );

    if (overdue.length > 0) {
      sections.push(
        `Overdue Invoices:\n${overdue.map((i) => `  - ${i.invoiceNumber}: $${i.amount.toFixed(2)}, due ${i.dueDate}`).join("\n")}`,
      );
    }
  }

  // Product context (if query mentions products, inventory, stock, reorder)
  if (
    msgLower.match(
      /product|stock|inventor|reorder|low|item|sku|window|door|glass|hardware/,
    )
  ) {
    const productList = db
      .select({
        sku: products.sku,
        name: products.name,
        category: products.category,
        unitPrice: products.unitPrice,
        available: inventory.quantityAvailable,
      })
      .from(products)
      .leftJoin(inventory, eq(products.id, inventory.productId))
      .limit(20)
      .all();

    const lowStock = productList.filter(
      (p) => p.available !== null && p.available <= 50,
    );

    if (lowStock.length > 0) {
      sections.push(
        `Low Stock Products:\n${lowStock.map((p) => `  - ${p.sku} ${p.name}: ${p.available} units`).join("\n")}`,
      );
    }

    sections.push(`Product catalog: ${productList.length} products loaded`);
  }

  // Order total
  const totalSpent = recentOrders.reduce((s, o) => s + o.total, 0);
  sections.push(`Total order value: $${totalSpent.toFixed(2)}`);

  const memoryHits = db
    .select()
    .from(memoryItems)
    .where(eq(memoryItems.customerId, customerId))
    .all()
    .filter((item) => {
      const lower =
        `${item.title} ${item.content} ${item.namespace}`.toLowerCase();
      return msgLower
        .split(/\s+/)
        .some((token) => token.length > 3 && lower.includes(token));
    })
    .slice(0, 3);

  if (memoryHits.length > 0) {
    sections.push(
      `Relevant Memory:\n${memoryHits
        .map((item) => `  - ${item.title}: ${item.content}`)
        .join("\n")}`,
    );
  }

  return sections.join("\n\n");
}

async function gatherAdminContext(db: Db): Promise<string> {
  const sections: string[] = [];
  const now = new Date().toISOString();

  const allCustomers = db.select().from(customers).all();
  const allOrders = db.select().from(orders).all();
  const allInvoices = db.select().from(invoices).all();
  const activeSessions = db
    .select()
    .from(userSessions)
    .all()
    .filter((session) => !session.revokedAt && session.expiresAt > now);
  const recentAudit = db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(8)
    .all();

  const revenue = allOrders
    .filter(
      (order) => order.status === "shipped" || order.status === "delivered",
    )
    .reduce((sum, order) => sum + order.total, 0);
  const outstanding = allInvoices
    .filter(
      (invoice) => invoice.status === "pending" || invoice.status === "overdue",
    )
    .reduce((sum, invoice) => sum + invoice.amount, 0);

  sections.push(
    `Platform summary: ${allCustomers.length} customers, ${allOrders.length} orders, ${allInvoices.length} invoices, ${activeSessions.length} active sessions.`,
  );
  sections.push(
    `Financial summary: $${revenue.toFixed(2)} revenue from shipped/delivered orders, $${outstanding.toFixed(2)} outstanding across pending/overdue invoices.`,
  );

  const overdueCustomers = allCustomers
    .map((customer) => {
      const overdueAmount = allInvoices
        .filter(
          (invoice) =>
            invoice.customerId === customer.id && invoice.status === "overdue",
        )
        .reduce((sum, invoice) => sum + invoice.amount, 0);
      return { companyName: customer.companyName, overdueAmount };
    })
    .filter((customer) => customer.overdueAmount > 0)
    .sort((a, b) => b.overdueAmount - a.overdueAmount)
    .slice(0, 5);

  if (overdueCustomers.length > 0) {
    sections.push(
      `Top overdue exposure:\n${overdueCustomers
        .map(
          (customer) =>
            `  - ${customer.companyName}: $${customer.overdueAmount.toFixed(2)}`,
        )
        .join("\n")}`,
    );
  }

  if (recentAudit.length > 0) {
    sections.push(
      `Recent operational activity:\n${recentAudit
        .map(
          (entry) =>
            `  - ${entry.createdAt}: ${entry.action} (${entry.entityType}/${entry.entityId ?? "n/a"})`,
        )
        .join("\n")}`,
    );
  }

  return sections.join("\n\n");
}

async function gatherVendorContext(
  db: Db,
  customerId: number,
  message: string,
): Promise<string> {
  const sections: string[] = [];
  const msgLower = message.toLowerCase();

  const vendor = db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .get();
  const profile = db
    .select()
    .from(vendorProfiles)
    .where(eq(vendorProfiles.customerId, customerId))
    .get();

  if (vendor) {
    sections.push(
      `Vendor: ${vendor.companyName} (${vendor.accountNumber}), ${vendor.city}, ${vendor.state}`,
    );
  }
  if (profile) {
    sections.push(
      `Vendor profile: code ${profile.vendorCode}, category focus ${profile.categoryFocus}, payment terms ${profile.paymentTerms}, lead time ${profile.leadTimeDays} days, reliability ${profile.reliabilityScore}.`,
    );
  }

  const poRows = db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.vendorCustomerId, customerId))
    .orderBy(desc(purchaseOrders.updatedAt))
    .limit(10)
    .all();
  const vendorInvoiceRows = db
    .select()
    .from(vendorInvoices)
    .where(eq(vendorInvoices.vendorCustomerId, customerId))
    .orderBy(desc(vendorInvoices.createdAt))
    .limit(10)
    .all();
  const vendorCatalogRows = db
    .select({
      vendorSku: vendorCatalogItems.vendorSku,
      unitCost: vendorCatalogItems.unitCost,
      minimumOrderQty: vendorCatalogItems.minimumOrderQty,
      leadTimeDays: vendorCatalogItems.leadTimeDays,
      availableQty: vendorCatalogItems.availableQty,
      status: vendorCatalogItems.status,
      productName: products.name,
      productCategory: products.category,
    })
    .from(vendorCatalogItems)
    .leftJoin(products, eq(vendorCatalogItems.productId, products.id))
    .where(eq(vendorCatalogItems.vendorCustomerId, customerId))
    .orderBy(desc(vendorCatalogItems.updatedAt))
    .limit(12)
    .all();

  const shipmentRows = db
    .select()
    .from(vendorShipments)
    .all()
    .filter((shipment) =>
      poRows.some((po) => po.id === shipment.purchaseOrderId),
    )
    .slice(0, 10);

  if (poRows.length > 0) {
    sections.push(
      `Recent purchase orders:\n${poRows
        .map(
          (row) =>
            `  - ${row.purchaseOrderNumber}: ${row.status}, $${row.total.toFixed(2)}, expected ${row.expectedShipDate ?? "TBD"}`,
        )
        .join("\n")}`,
    );
  }

  if (vendorInvoiceRows.length > 0) {
    const pendingExposure = vendorInvoiceRows
      .filter((row) => ["pending", "approved", "disputed"].includes(row.status))
      .reduce((sum, row) => sum + row.amount, 0);
    sections.push(
      `Vendor invoices: ${vendorInvoiceRows.length} total, $${pendingExposure.toFixed(2)} pending/approved/disputed.`,
    );
  }

  if (
    msgLower.match(/catalog|constraint|availability|lead time|inventory|stock/)
  ) {
    const constrainedItems = vendorCatalogRows.filter(
      (row) => row.status === "constrained",
    );
    if (constrainedItems.length > 0) {
      sections.push(
        `Constrained catalog items:\n${constrainedItems
          .map(
            (row) =>
              `  - ${row.vendorSku} ${row.productName ?? "Unknown product"}: ${row.availableQty} units, ${row.leadTimeDays} day lead time`,
          )
          .join("\n")}`,
      );
    }
  }

  if (shipmentRows.length > 0) {
    sections.push(
      `Recent shipment statuses:\n${shipmentRows
        .map(
          (row) =>
            `  - ${row.trackingNumber}: ${row.status}, ETA ${row.estimatedDelivery ?? "TBD"}`,
        )
        .join("\n")}`,
    );
  }

  const memoryHits = db
    .select()
    .from(memoryItems)
    .where(eq(memoryItems.customerId, customerId))
    .all()
    .filter((item) => {
      const lower =
        `${item.title} ${item.content} ${item.namespace}`.toLowerCase();
      return msgLower
        .split(/\s+/)
        .some((token) => token.length > 3 && lower.includes(token));
    })
    .slice(0, 3);

  if (memoryHits.length > 0) {
    sections.push(
      `Relevant memory:\n${memoryHits
        .map((item) => `  - ${item.title}: ${item.content}`)
        .join("\n")}`,
    );
  }

  return sections.join("\n\n");
}
