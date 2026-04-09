import { desc, eq } from "drizzle-orm";
import type { Db } from "@autochain/db";
import {
  assistantEntries,
  assistantSessions,
  connectorAccounts,
  documents,
  invoices,
  memoryItems,
  orders,
  products,
  purchaseOrders,
  vendorCatalogItems,
  vendorInvoices,
  vendorProfiles,
  vendorShipments,
  userSessions,
  workflowRuns,
  workflowSteps,
} from "@autochain/db";
import type {
  AssistantEntry,
  AssistantSession,
  AssistantWorkspaceOverview,
  DocumentKind,
} from "@autochain/shared";
import { createGeneratedDocument } from "./document-studio.js";
import { createWorkflowRun } from "./workflow-runtime.js";
import { listFrequentChatPrompts } from "./chat-cache.js";

type AppRole = "customer" | "vendor" | "admin";

function parseObject(value: string | null | undefined) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function toEntry(row: typeof assistantEntries.$inferSelect): AssistantEntry {
  return {
    id: row.id,
    sessionId: row.sessionId,
    role: row.role,
    entryType: row.entryType,
    content: row.content,
    metadata: parseObject(row.metadata),
    createdAt: row.createdAt,
  };
}

function toSession(
  row: typeof assistantSessions.$inferSelect,
  entries?: AssistantEntry[],
): AssistantSession {
  return {
    id: row.id,
    customerId: row.customerId,
    userId: row.userId,
    role: row.role,
    mode: row.mode,
    title: row.title,
    status: row.status,
    sourcePage: row.sourcePage ?? null,
    linkedWorkflowRunId: row.linkedWorkflowRunId ?? null,
    linkedDocumentId: row.linkedDocumentId ?? null,
    lastError: row.lastError ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    entries,
  };
}

function canAccessSession(
  row: typeof assistantSessions.$inferSelect,
  role: AppRole,
  userId: number,
  customerId: number,
) {
  if (role === "admin") {
    return row.customerId === customerId;
  }
  return row.userId === userId && row.customerId === customerId;
}

function currency(value: number) {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

function summarizeEntries(session: AssistantSession) {
  return (session.entries ?? [])
    .slice(-10)
    .map((entry) => `${entry.role}: ${entry.content}`)
    .join("\n");
}

async function buildCustomerSnapshot(
  db: Db,
  customerId: number,
  role: AppRole,
) {
  const recentOrders = db
    .select()
    .from(orders)
    .where(eq(orders.customerId, customerId))
    .orderBy(desc(orders.updatedAt))
    .limit(6)
    .all();
  const customerInvoices = db
    .select()
    .from(invoices)
    .where(eq(invoices.customerId, customerId))
    .orderBy(desc(invoices.createdAt))
    .limit(10)
    .all();
  const lowStock = db.select().from(products).limit(4).all();
  const riskySessions =
    role === "admin"
      ? db
          .select()
          .from(userSessions)
          .where(eq(userSessions.customerId, customerId))
          .orderBy(desc(userSessions.lastSeenAt))
          .limit(5)
          .all()
          .filter((session) => !session.revokedAt)
          .filter(
            (session) =>
              session.autonomy === "agent" || session.mode === "agentic",
          )
      : [];

  const overdueInvoices = customerInvoices.filter(
    (invoice) => invoice.status === "overdue" || invoice.status === "pending",
  );
  const openExposure = overdueInvoices.reduce(
    (sum, invoice) => sum + invoice.amount,
    0,
  );
  const activeOrders = recentOrders.filter(
    (order) => order.status !== "delivered" && order.status !== "cancelled",
  );

  return {
    orderCount: recentOrders.length,
    activeOrders,
    overdueInvoices,
    openExposure,
    lowStock,
    riskySessions,
  };
}

async function buildVendorSnapshot(db: Db, customerId: number) {
  const profile = db
    .select()
    .from(vendorProfiles)
    .where(eq(vendorProfiles.customerId, customerId))
    .get();
  const purchaseOrderRows = db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.vendorCustomerId, customerId))
    .orderBy(desc(purchaseOrders.updatedAt))
    .limit(10)
    .all();
  const invoiceRows = db
    .select()
    .from(vendorInvoices)
    .where(eq(vendorInvoices.vendorCustomerId, customerId))
    .orderBy(desc(vendorInvoices.createdAt))
    .limit(10)
    .all();
  const catalogRows = db
    .select()
    .from(vendorCatalogItems)
    .where(eq(vendorCatalogItems.vendorCustomerId, customerId))
    .orderBy(desc(vendorCatalogItems.updatedAt))
    .limit(12)
    .all();
  const shipmentRows = db
    .select()
    .from(vendorShipments)
    .all()
    .filter((shipment) =>
      purchaseOrderRows.some((order) => order.id === shipment.purchaseOrderId),
    );

  const openPurchaseOrders = purchaseOrderRows.filter((row) =>
    ["sent", "confirmed", "in_production", "shipped"].includes(row.status),
  );
  const pendingInvoices = invoiceRows.filter((row) =>
    ["pending", "approved", "disputed"].includes(row.status),
  );
  const constrainedCatalog = catalogRows.filter(
    (row) => row.status === "constrained",
  );
  const inTransitShipments = shipmentRows.filter(
    (row) => row.status === "in_transit" || row.status === "delayed",
  );

  return {
    profile,
    purchaseOrderRows,
    invoiceRows,
    catalogRows,
    shipmentRows,
    openPurchaseOrders,
    pendingInvoices,
    constrainedCatalog,
    inTransitShipments,
  };
}

function buildVoiceReply(
  transcript: string,
  snapshot: Awaited<ReturnType<typeof buildCustomerSnapshot>>,
  role: AppRole,
) {
  const normalized = transcript.toLowerCase();

  if (
    normalized.includes("invoice") ||
    normalized.includes("payment") ||
    normalized.includes("overdue")
  ) {
    return `You currently have ${snapshot.overdueInvoices.length} unpaid or overdue invoices totaling ${currency(snapshot.openExposure)}. I can turn this into a finance review or an agentic plan next.`;
  }

  if (
    normalized.includes("order") ||
    normalized.includes("shipment") ||
    normalized.includes("delivery")
  ) {
    return `There are ${snapshot.activeOrders.length} active orders still moving through processing or shipment. I can convert this into a written summary or open a workflow to review them step by step.`;
  }

  if (
    normalized.includes("stock") ||
    normalized.includes("inventory") ||
    normalized.includes("reorder")
  ) {
    return `I pulled the current product context and can prepare reorder suggestions from the inventory view. I can save a product brief or create a workflow from this voice session.`;
  }

  if (role === "admin" && normalized.includes("risk")) {
    return `There are ${snapshot.riskySessions.length} elevated sessions in the current tenant context. I can create a risk report or open an approval workflow from this briefing.`;
  }

  return "Voice summary captured. I can convert this conversation into a text summary, a document draft, or an agentic workflow plan.";
}

function buildVendorVoiceReply(
  transcript: string,
  snapshot: Awaited<ReturnType<typeof buildVendorSnapshot>>,
) {
  const normalized = transcript.toLowerCase();

  if (
    normalized.includes("invoice") ||
    normalized.includes("payment") ||
    normalized.includes("payable")
  ) {
    return `You have ${snapshot.pendingInvoices.length} vendor invoices awaiting payment or resolution. I can turn this into a vendor finance review or a follow-up workflow.`;
  }

  if (
    normalized.includes("purchase order") ||
    normalized.includes("po") ||
    normalized.includes("shipment") ||
    normalized.includes("lead time")
  ) {
    return `There are ${snapshot.openPurchaseOrders.length} open purchase orders and ${snapshot.inTransitShipments.length} active shipments in flight. I can convert this into a purchase order brief or an execution plan.`;
  }

  if (
    normalized.includes("catalog") ||
    normalized.includes("constraint") ||
    normalized.includes("availability") ||
    normalized.includes("stock")
  ) {
    return `I found ${snapshot.constrainedCatalog.length} constrained catalog items in the current vendor account. I can prepare a catalog risk report or a replenishment workflow next.`;
  }

  return "Vendor voice summary captured. I can convert this into a text summary, a purchase order brief, or a vendor workflow plan.";
}

function buildVisualReply(
  description: string,
  title: string,
  snapshot: Awaited<ReturnType<typeof buildCustomerSnapshot>>,
  role: AppRole,
) {
  const normalized = `${title} ${description}`.toLowerCase();

  if (normalized.includes("invoice") || normalized.includes("aging")) {
    return `Visual review captured for finance context. I see ${snapshot.overdueInvoices.length} invoices that can be summarized into an unpaid invoice review.`;
  }

  if (
    normalized.includes("inventory") ||
    normalized.includes("stock") ||
    normalized.includes("product")
  ) {
    return `Visual product context captured. I can turn this into reorder recommendations or a product operations brief.`;
  }

  if (role === "admin" && normalized.includes("session")) {
    return `Admin visual context captured. I can draft an operational report with session and account follow-up actions.`;
  }

  return "Visual context captured. I can turn this into a report, agreement draft, or workflow plan from the current workspace.";
}

function buildVendorVisualReply(
  description: string,
  title: string,
  snapshot: Awaited<ReturnType<typeof buildVendorSnapshot>>,
) {
  const normalized = `${title} ${description}`.toLowerCase();

  if (
    normalized.includes("invoice") ||
    normalized.includes("aging") ||
    normalized.includes("payable")
  ) {
    return `Vendor finance context captured. I can turn ${snapshot.pendingInvoices.length} pending or disputed invoices into a payment review.`;
  }

  if (
    normalized.includes("catalog") ||
    normalized.includes("constraint") ||
    normalized.includes("availability")
  ) {
    return `Vendor catalog context captured. I see ${snapshot.constrainedCatalog.length} constrained items that can be turned into an availability report.`;
  }

  if (
    normalized.includes("shipment") ||
    normalized.includes("purchase order") ||
    normalized.includes("lead time")
  ) {
    return `Vendor operations context captured. I can turn open purchase orders and shipment status into a supplier operations brief.`;
  }

  return "Vendor visual context captured. I can turn this into a report, agreement draft, or workflow plan from the current workspace.";
}

function defaultTitle(mode: "text" | "voice" | "video" | "agentic") {
  switch (mode) {
    case "voice":
      return "Voice briefing";
    case "video":
      return "Visual review";
    case "agentic":
      return "Agentic planning session";
    case "text":
    default:
      return "Assistant workspace";
  }
}

export function listAssistantSessions(
  db: Db,
  input: {
    role: AppRole;
    userId: number;
    customerId: number;
    mode?: "text" | "voice" | "video" | "agentic";
    limit?: number;
  },
) {
  return db
    .select()
    .from(assistantSessions)
    .orderBy(desc(assistantSessions.updatedAt))
    .all()
    .filter((row) =>
      canAccessSession(row, input.role, input.userId, input.customerId),
    )
    .filter((row) => (input.mode ? row.mode === input.mode : true))
    .slice(0, input.limit ?? 12)
    .map((row) => toSession(row));
}

export function getAssistantSessionById(
  db: Db,
  input: {
    sessionId: number;
    role: AppRole;
    userId: number;
    customerId: number;
  },
) {
  const session = db
    .select()
    .from(assistantSessions)
    .where(eq(assistantSessions.id, input.sessionId))
    .get();

  if (!session) return null;
  if (!canAccessSession(session, input.role, input.userId, input.customerId)) {
    return null;
  }

  const entries = db
    .select()
    .from(assistantEntries)
    .where(eq(assistantEntries.sessionId, session.id))
    .orderBy(desc(assistantEntries.id))
    .all()
    .map(toEntry)
    .reverse();

  return toSession(session, entries);
}

export function createAssistantSession(input: {
  db: Db;
  customerId: number;
  userId: number;
  role: AppRole;
  mode: "text" | "voice" | "video" | "agentic";
  title?: string;
  sourcePage?: string;
}) {
  const now = new Date().toISOString();
  const [session] = input.db
    .insert(assistantSessions)
    .values({
      customerId: input.customerId,
      userId: input.userId,
      role: input.role,
      mode: input.mode,
      title: input.title?.trim() || defaultTitle(input.mode),
      status: "active",
      sourcePage: input.sourcePage ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .all();

  return toSession(session!);
}

export function addAssistantEntry(input: {
  db: Db;
  sessionId: number;
  role: "user" | "assistant" | "system";
  entryType:
    | "message"
    | "transcript"
    | "speech"
    | "visual"
    | "plan"
    | "event"
    | "summary"
    | "artifact";
  content: string;
  metadata?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  const [entry] = input.db
    .insert(assistantEntries)
    .values({
      sessionId: input.sessionId,
      role: input.role,
      entryType: input.entryType,
      content: input.content,
      metadata: JSON.stringify(input.metadata ?? {}),
      createdAt: now,
    })
    .returning()
    .all();

  input.db
    .update(assistantSessions)
    .set({ updatedAt: now })
    .where(eq(assistantSessions.id, input.sessionId))
    .run();

  return toEntry(entry!);
}

export function updateAssistantSession(
  db: Db,
  sessionId: number,
  changes: Partial<typeof assistantSessions.$inferInsert>,
) {
  db.update(assistantSessions)
    .set({
      ...changes,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(assistantSessions.id, sessionId))
    .run();
}

export function closeAssistantSession(
  db: Db,
  sessionId: number,
  status: "completed" | "cancelled" = "completed",
) {
  updateAssistantSession(db, sessionId, { status });
}

export async function handleVoiceTurn(input: {
  db: Db;
  sessionId: number;
  customerId: number;
  role: AppRole;
  transcript: string;
}) {
  addAssistantEntry({
    db: input.db,
    sessionId: input.sessionId,
    role: "user",
    entryType: "transcript",
    content: input.transcript,
  });

  const customerSnapshot =
    input.role === "vendor"
      ? null
      : await buildCustomerSnapshot(input.db, input.customerId, input.role);
  const vendorSnapshot =
    input.role === "vendor"
      ? await buildVendorSnapshot(input.db, input.customerId)
      : null;
  const reply =
    input.role === "vendor" && vendorSnapshot
      ? buildVendorVoiceReply(input.transcript, vendorSnapshot)
      : buildVoiceReply(input.transcript, customerSnapshot!, input.role);

  addAssistantEntry({
    db: input.db,
    sessionId: input.sessionId,
    role: "assistant",
    entryType: "speech",
    content: reply,
    metadata:
      input.role === "vendor"
        ? {
            pendingInvoiceCount: vendorSnapshot?.pendingInvoices.length ?? 0,
            openPurchaseOrderCount:
              vendorSnapshot?.openPurchaseOrders.length ?? 0,
          }
        : {
            overdueInvoiceCount: customerSnapshot?.overdueInvoices.length ?? 0,
            activeOrderCount: customerSnapshot?.activeOrders.length ?? 0,
          },
  });

  return { reply };
}

export async function handleVisualContext(input: {
  db: Db;
  sessionId: number;
  customerId: number;
  role: AppRole;
  title: string;
  description: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
}) {
  addAssistantEntry({
    db: input.db,
    sessionId: input.sessionId,
    role: "user",
    entryType: "visual",
    content: `${input.title}\n${input.description}`.trim(),
    metadata: {
      fileName: input.fileName ?? null,
      fileType: input.fileType ?? null,
      fileSize: input.fileSize ?? null,
    },
  });

  const customerSnapshot =
    input.role === "vendor"
      ? null
      : await buildCustomerSnapshot(input.db, input.customerId, input.role);
  const vendorSnapshot =
    input.role === "vendor"
      ? await buildVendorSnapshot(input.db, input.customerId)
      : null;
  const reply =
    input.role === "vendor" && vendorSnapshot
      ? buildVendorVisualReply(input.description, input.title, vendorSnapshot)
      : buildVisualReply(
          input.description,
          input.title,
          customerSnapshot!,
          input.role,
        );

  addAssistantEntry({
    db: input.db,
    sessionId: input.sessionId,
    role: "assistant",
    entryType: "summary",
    content: reply,
    metadata: {
      title: input.title,
    },
  });

  return { reply };
}

export async function createDocumentFromAssistantSession(input: {
  db: Db;
  session: AssistantSession;
  kind: DocumentKind;
  title: string;
}) {
  const prompt = `Create a ${input.kind} from this assistant session.\n\n${summarizeEntries(input.session)}`;
  const { document } = await createGeneratedDocument({
    db: input.db,
    customerId: input.session.customerId,
    ownerUserId: input.session.userId,
    kind: input.kind,
    title: input.title,
    prompt,
  });

  updateAssistantSession(input.db, input.session.id, {
    linkedDocumentId: document.id,
  });

  addAssistantEntry({
    db: input.db,
    sessionId: input.session.id,
    role: "system",
    entryType: "artifact",
    content: `Generated document: ${document.title}`,
    metadata: {
      documentId: document.id,
      kind: document.kind,
    },
  });

  return document;
}

export async function createWorkflowFromAssistantSession(input: {
  db: Db;
  session: AssistantSession;
  task: string;
  autonomy: "manual" | "ask" | "agent";
  sessionId: number | null;
}) {
  const task = input.task.trim();
  const run = await createWorkflowRun({
    db: input.db,
    customerId: input.session.customerId,
    userId: input.session.userId,
    role: input.session.role,
    sessionId: input.sessionId,
    mode: "agentic",
    autonomy: input.autonomy === "manual" ? "ask" : input.autonomy,
    task,
  });

  if (!run || "error" in run) {
    return run;
  }

  updateAssistantSession(input.db, input.session.id, {
    linkedWorkflowRunId: run.id,
  });

  addAssistantEntry({
    db: input.db,
    sessionId: input.session.id,
    role: "system",
    entryType: "plan",
    content: `Created workflow plan: ${run.task}`,
    metadata: {
      workflowRunId: run.id,
      status: run.status,
    },
  });

  return run;
}

export function buildAssistantWorkspaceOverview(input: {
  db: Db;
  role: AppRole;
  userId: number;
  customerId: number;
}): AssistantWorkspaceOverview {
  const sessions = listAssistantSessions(input.db, {
    role: input.role,
    userId: input.userId,
    customerId: input.customerId,
    limit: 8,
  });

  const pendingApprovals = input.db
    .select()
    .from(workflowRuns)
    .orderBy(desc(workflowRuns.updatedAt))
    .all()
    .filter((run) =>
      input.role === "admin"
        ? run.customerId === input.customerId
        : run.customerId === input.customerId && run.userId === input.userId,
    )
    .filter((run) => run.status === "waiting_approval")
    .slice(0, 6)
    .map((run) => {
      const steps = input.db
        .select()
        .from(workflowSteps)
        .where(eq(workflowSteps.runId, run.id))
        .all();
      return {
        runId: run.id,
        task: run.task,
        status: run.status,
        stepCount: steps.length,
        approvalCount: steps.filter((step) => step.requiresApproval).length,
        createdAt: run.createdAt,
      };
    });

  const recentDocuments = input.db
    .select()
    .from(documents)
    .orderBy(desc(documents.updatedAt))
    .all()
    .filter((document) =>
      input.role === "admin"
        ? document.customerId === input.customerId
        : document.customerId === input.customerId,
    )
    .slice(0, 6)
    .map((document) => ({
      id: document.id,
      title: document.title,
      kind: document.kind,
      status: document.status,
      updatedAt: document.updatedAt,
    }));

  const recentMemory = input.db
    .select()
    .from(memoryItems)
    .orderBy(desc(memoryItems.updatedAt))
    .all()
    .filter((item) => item.customerId === input.customerId)
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      title: item.title,
      namespace: item.namespace,
      content: item.content,
      updatedAt: item.updatedAt,
    }));

  const connectors = input.db
    .select()
    .from(connectorAccounts)
    .orderBy(desc(connectorAccounts.updatedAt))
    .all()
    .filter((account) => account.customerId === input.customerId)
    .slice(0, 6)
    .map((account) => ({
      id: account.id,
      provider: account.provider,
      accountIdentifier: account.accountIdentifier,
      status: account.status,
      updatedAt: account.updatedAt,
    }));

  const frequentPrompts = listFrequentChatPrompts({
    db: input.db,
    customerId: input.customerId,
    userId: input.userId,
    role: input.role,
    limit: 6,
  });

  return {
    sessions,
    frequentPrompts,
    pendingApprovals,
    recentDocuments,
    recentMemory,
    connectors,
  };
}
