import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyName: text("company_name").notNull(),
  contactEmail: text("contact_email").notNull().unique(),
  contactName: text("contact_name").notNull(),
  accountNumber: text("account_number").notNull().unique(),
  accountType: text("account_type", { enum: ["client", "vendor"] })
    .notNull()
    .default("client"),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  status: text("status", { enum: ["active", "inactive", "suspended"] })
    .notNull()
    .default("active"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sku: text("sku").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  category: text("category", {
    enum: [
      "windows",
      "doors",
      "hardware",
      "glass",
      "weatherstripping",
      "frames",
      "accessories",
    ],
  }).notNull(),
  unitPrice: real("unit_price").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const inventory = sqliteTable("inventory", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  quantityAvailable: integer("quantity_available").notNull().default(0),
  quantityReserved: integer("quantity_reserved").notNull().default(0),
  warehouse: text("warehouse").notNull().default("main"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const customerPrices = sqliteTable("customer_prices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  customPrice: real("custom_price"),
  discountPct: real("discount_pct"),
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["customer", "vendor", "admin"] })
    .notNull()
    .default("customer"),
  status: text("status", { enum: ["active", "disabled"] })
    .notNull()
    .default("active"),
  mustResetPassword: integer("must_reset_password", { mode: "boolean" })
    .notNull()
    .default(false),
  featureFlags: text("feature_flags").notNull().default("[]"),
  lastLoginAt: text("last_login_at"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const userSessions = sqliteTable("user_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id),
  role: text("role", { enum: ["customer", "vendor", "admin"] })
    .notNull()
    .default("customer"),
  sessionToken: text("session_token").notNull().unique(),
  mode: text("mode", { enum: ["text", "voice", "video", "agentic"] })
    .notNull()
    .default("text"),
  autonomy: text("autonomy", { enum: ["manual", "ask", "agent"] })
    .notNull()
    .default("manual"),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  lastSeenAt: text("last_seen_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  expiresAt: text("expires_at").notNull(),
  revokedAt: text("revoked_at"),
  revokeReason: text("revoke_reason"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actorUserId: integer("actor_user_id").references(() => users.id),
  actorRole: text("actor_role", {
    enum: ["customer", "vendor", "admin", "system"],
  })
    .notNull()
    .default("system"),
  customerId: integer("customer_id").references(() => customers.id),
  targetUserId: integer("target_user_id").references(() => users.id),
  sessionId: integer("session_id").references(() => userSessions.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  outcome: text("outcome", {
    enum: ["success", "blocked", "cancelled", "failed"],
  })
    .notNull()
    .default("success"),
  details: text("details").notNull().default("{}"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const documents = sqliteTable("documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id),
  ownerUserId: integer("owner_user_id")
    .notNull()
    .references(() => users.id),
  kind: text("kind", { enum: ["report", "invoice", "agreement", "brief"] })
    .notNull()
    .default("brief"),
  title: text("title").notNull(),
  status: text("status", { enum: ["draft", "published", "archived"] })
    .notNull()
    .default("draft"),
  currentVersionNumber: integer("current_version_number").notNull().default(1),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const documentVersions = sqliteTable("document_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  documentId: integer("document_id")
    .notNull()
    .references(() => documents.id),
  versionNumber: integer("version_number").notNull(),
  title: text("title").notNull(),
  contentMarkdown: text("content_markdown").notNull(),
  contentHtml: text("content_html"),
  metadata: text("metadata").notNull().default("{}"),
  filePath: text("file_path"),
  createdByUserId: integer("created_by_user_id")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const workflowRuns = sqliteTable("workflow_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  role: text("role", { enum: ["customer", "vendor", "admin"] })
    .notNull()
    .default("customer"),
  sessionId: integer("session_id").references(() => userSessions.id),
  mode: text("mode", { enum: ["text", "voice", "video", "agentic"] })
    .notNull()
    .default("text"),
  autonomy: text("autonomy", { enum: ["manual", "ask", "agent"] })
    .notNull()
    .default("manual"),
  sandbox: text("sandbox", { enum: ["app"] })
    .notNull()
    .default("app"),
  task: text("task").notNull(),
  status: text("status", {
    enum: [
      "planned",
      "running",
      "waiting_approval",
      "completed",
      "failed",
      "cancelled",
      "expired",
    ],
  })
    .notNull()
    .default("planned"),
  currentStepIndex: integer("current_step_index").notNull().default(0),
  retryCount: integer("retry_count").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(3),
  lastError: text("last_error"),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const workflowSteps = sqliteTable("workflow_steps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: integer("run_id")
    .notNull()
    .references(() => workflowRuns.id),
  stepNumber: integer("step_number").notNull(),
  title: text("title").notNull(),
  actionKey: text("action_key").notNull(),
  actionType: text("action_type", {
    enum: ["navigate", "query", "generate", "mutate", "connector"],
  }).notNull(),
  target: text("target"),
  payload: text("payload").notNull().default("{}"),
  status: text("status", {
    enum: [
      "pending",
      "approved",
      "running",
      "completed",
      "failed",
      "cancelled",
      "skipped",
    ],
  })
    .notNull()
    .default("pending"),
  requiresApproval: integer("requires_approval", { mode: "boolean" })
    .notNull()
    .default(false),
  retryCount: integer("retry_count").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(2),
  lastError: text("last_error"),
  checkpointData: text("checkpoint_data").notNull().default("{}"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const workflowEvents = sqliteTable("workflow_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: integer("run_id")
    .notNull()
    .references(() => workflowRuns.id),
  stepId: integer("step_id").references(() => workflowSteps.id),
  eventType: text("event_type").notNull(),
  message: text("message").notNull(),
  data: text("data").notNull().default("{}"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const workflowCheckpoints = sqliteTable("workflow_checkpoints", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: integer("run_id")
    .notNull()
    .references(() => workflowRuns.id),
  stepId: integer("step_id").references(() => workflowSteps.id),
  checkpointKey: text("checkpoint_key").notNull(),
  data: text("data").notNull().default("{}"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const workflowArtifacts = sqliteTable("workflow_artifacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: integer("run_id")
    .notNull()
    .references(() => workflowRuns.id),
  stepId: integer("step_id").references(() => workflowSteps.id),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  path: text("path"),
  data: text("data").notNull().default("{}"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const memoryItems = sqliteTable("memory_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id),
  userId: integer("user_id").references(() => users.id),
  workflowRunId: integer("workflow_run_id").references(() => workflowRuns.id),
  scope: text("scope", { enum: ["tenant", "user", "workflow"] })
    .notNull()
    .default("tenant"),
  namespace: text("namespace").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  metadata: text("metadata").notNull().default("{}"),
  sourceType: text("source_type").notNull().default("manual"),
  sourceId: text("source_id"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const connectorAccounts = sqliteTable("connector_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id),
  provider: text("provider").notNull(),
  accountIdentifier: text("account_identifier").notNull(),
  status: text("status", {
    enum: ["disconnected", "connected", "error"],
  })
    .notNull()
    .default("disconnected"),
  scopes: text("scopes").notNull().default("[]"),
  metadata: text("metadata").notNull().default("{}"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const assistantSessions = sqliteTable("assistant_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  role: text("role", { enum: ["customer", "vendor", "admin"] })
    .notNull()
    .default("customer"),
  mode: text("mode", { enum: ["text", "voice", "video", "agentic"] })
    .notNull()
    .default("text"),
  title: text("title").notNull(),
  status: text("status", {
    enum: ["active", "paused", "completed", "cancelled"],
  })
    .notNull()
    .default("active"),
  sourcePage: text("source_page"),
  linkedWorkflowRunId: integer("linked_workflow_run_id").references(
    () => workflowRuns.id,
  ),
  linkedDocumentId: integer("linked_document_id").references(
    () => documents.id,
  ),
  lastError: text("last_error"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const assistantEntries = sqliteTable("assistant_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id")
    .notNull()
    .references(() => assistantSessions.id),
  role: text("role", { enum: ["user", "assistant", "system"] })
    .notNull()
    .default("assistant"),
  entryType: text("entry_type", {
    enum: [
      "message",
      "transcript",
      "speech",
      "visual",
      "plan",
      "event",
      "summary",
      "artifact",
    ],
  })
    .notNull()
    .default("message"),
  content: text("content").notNull(),
  metadata: text("metadata").notNull().default("{}"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const vendorProfiles = sqliteTable("vendor_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id),
  vendorCode: text("vendor_code").notNull().unique(),
  categoryFocus: text("category_focus").notNull(),
  paymentTerms: text("payment_terms").notNull(),
  leadTimeDays: integer("lead_time_days").notNull().default(14),
  reliabilityScore: real("reliability_score").notNull().default(90),
  preferredShippingMethod: text("preferred_shipping_method"),
  operationsEmail: text("operations_email"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const vendorCatalogItems = sqliteTable("vendor_catalog_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  vendorCustomerId: integer("vendor_customer_id")
    .notNull()
    .references(() => customers.id),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  vendorSku: text("vendor_sku").notNull(),
  unitCost: real("unit_cost").notNull(),
  minimumOrderQty: integer("minimum_order_qty").notNull().default(1),
  leadTimeDays: integer("lead_time_days").notNull().default(14),
  availableQty: integer("available_qty").notNull().default(0),
  status: text("status", {
    enum: ["active", "constrained", "paused"],
  })
    .notNull()
    .default("active"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const purchaseOrders = sqliteTable("purchase_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  vendorCustomerId: integer("vendor_customer_id")
    .notNull()
    .references(() => customers.id),
  issuedByUserId: integer("issued_by_user_id")
    .notNull()
    .references(() => users.id),
  purchaseOrderNumber: text("purchase_order_number").notNull().unique(),
  status: text("status", {
    enum: [
      "draft",
      "sent",
      "confirmed",
      "in_production",
      "shipped",
      "received",
      "cancelled",
    ],
  })
    .notNull()
    .default("draft"),
  expectedShipDate: text("expected_ship_date"),
  total: real("total").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const purchaseOrderLines = sqliteTable("purchase_order_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  purchaseOrderId: integer("purchase_order_id")
    .notNull()
    .references(() => purchaseOrders.id),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  quantity: integer("quantity").notNull(),
  unitCost: real("unit_cost").notNull(),
  lineTotal: real("line_total").notNull(),
});

export const vendorShipments = sqliteTable("vendor_shipments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  purchaseOrderId: integer("purchase_order_id")
    .notNull()
    .references(() => purchaseOrders.id),
  carrier: text("carrier").notNull(),
  trackingNumber: text("tracking_number").notNull(),
  status: text("status", {
    enum: ["pending", "in_transit", "delivered", "delayed"],
  })
    .notNull()
    .default("pending"),
  estimatedDelivery: text("estimated_delivery"),
  events: text("events").notNull().default("[]"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const vendorInvoices = sqliteTable("vendor_invoices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  purchaseOrderId: integer("purchase_order_id")
    .notNull()
    .references(() => purchaseOrders.id),
  vendorCustomerId: integer("vendor_customer_id")
    .notNull()
    .references(() => customers.id),
  invoiceNumber: text("invoice_number").notNull().unique(),
  amount: real("amount").notNull(),
  status: text("status", {
    enum: ["pending", "approved", "paid", "disputed"],
  })
    .notNull()
    .default("pending"),
  dueDate: text("due_date").notNull(),
  paidAt: text("paid_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const chatCaches = sqliteTable("chat_caches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id),
  userId: integer("user_id").references(() => users.id),
  sessionId: integer("session_id").references(() => assistantSessions.id),
  role: text("role", { enum: ["customer", "vendor", "admin"] })
    .notNull()
    .default("customer"),
  sourceMode: text("source_mode", {
    enum: ["text", "voice", "video", "agentic"],
  })
    .notNull()
    .default("text"),
  normalizedPrompt: text("normalized_prompt").notNull(),
  promptLabel: text("prompt_label").notNull(),
  hitCount: integer("hit_count").notNull().default(1),
  lastResponse: text("last_response"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id),
  orderNumber: text("order_number").notNull().unique(),
  status: text("status", {
    enum: [
      "draft",
      "confirmed",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
    ],
  })
    .notNull()
    .default("draft"),
  total: real("total").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const orderLines = sqliteTable("order_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  quantity: integer("quantity").notNull(),
  unitPrice: real("unit_price").notNull(),
  lineTotal: real("line_total").notNull(),
});

export const invoices = sqliteTable("invoices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id),
  invoiceNumber: text("invoice_number").notNull().unique(),
  amount: real("amount").notNull(),
  status: text("status", { enum: ["pending", "paid", "overdue"] })
    .notNull()
    .default("pending"),
  dueDate: text("due_date").notNull(),
  paidAt: text("paid_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const shipments = sqliteTable("shipments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id),
  carrier: text("carrier").notNull(),
  trackingNumber: text("tracking_number").notNull(),
  status: text("status", {
    enum: ["pending", "in_transit", "delivered", "exception"],
  })
    .notNull()
    .default("pending"),
  estimatedDelivery: text("estimated_delivery"),
  events: text("events").notNull().default("[]"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const ediTransactions = sqliteTable("edi_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").references(() => orders.id),
  type: text("type", { enum: ["850", "856", "810", "997"] }).notNull(),
  direction: text("direction", { enum: ["inbound", "outbound"] }).notNull(),
  payload: text("payload").notNull(),
  status: text("status", { enum: ["sent", "received", "error"] })
    .notNull()
    .default("sent"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
