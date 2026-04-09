import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@autochain/db";
import {
  customers,
  documents,
  documentVersions,
  invoices,
  memoryItems,
  orders,
  products,
} from "@autochain/db";
import type { DocumentKind } from "@autochain/shared";
import { persistDocumentFile } from "./storage.js";

function currency(value: number) {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

async function buildDocumentContent(
  db: Db,
  customerId: number,
  kind: DocumentKind,
  title: string,
  prompt: string,
) {
  const customer = db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .get();
  const recentOrders = db
    .select()
    .from(orders)
    .where(eq(orders.customerId, customerId))
    .orderBy(desc(orders.createdAt))
    .limit(10)
    .all();
  const customerInvoices = db
    .select()
    .from(invoices)
    .where(eq(invoices.customerId, customerId))
    .orderBy(desc(invoices.createdAt))
    .limit(10)
    .all();
  const topProducts = db.select().from(products).limit(5).all();
  const notes = db
    .select()
    .from(memoryItems)
    .where(
      and(
        eq(memoryItems.customerId, customerId),
        eq(memoryItems.scope, "tenant"),
      ),
    )
    .orderBy(desc(memoryItems.updatedAt))
    .limit(3)
    .all();

  const outstanding = customerInvoices
    .filter((invoice) => invoice.status !== "paid")
    .reduce((sum, invoice) => sum + invoice.amount, 0);

  const orderSummary = recentOrders
    .slice(0, 5)
    .map(
      (order) =>
        `- ${order.orderNumber}: ${order.status}, ${currency(order.total)}, ${new Date(order.createdAt).toLocaleDateString()}`,
    )
    .join("\n");

  const invoiceSummary = customerInvoices
    .slice(0, 5)
    .map(
      (invoice) =>
        `- ${invoice.invoiceNumber}: ${invoice.status}, ${currency(invoice.amount)}, due ${invoice.dueDate}`,
    )
    .join("\n");

  const memorySummary = notes
    .map((note) => `- ${note.title}: ${note.content}`)
    .join("\n");

  let body = "";

  if (kind === "report") {
    body = `## Executive Summary

Customer: ${customer?.companyName ?? "Unknown"}
Prompt: ${prompt}

### Current Snapshot
- Recent orders: ${recentOrders.length}
- Outstanding balance: ${currency(outstanding)}
- Recent invoices: ${customerInvoices.length}

### Recent Orders
${orderSummary || "- No recent orders"}

### Recent Invoices
${invoiceSummary || "- No recent invoices"}

### Notes
${memorySummary || "- No saved operational notes"}

### Recommendations
- Review overdue balances and shipment exceptions first.
- Use the workflow console to continue or schedule follow-up work.
`;
  } else if (kind === "invoice") {
    body = `## Invoice Review Draft

Customer: ${customer?.companyName ?? "Unknown"}
Prompt: ${prompt}

### Open Balance
- Outstanding amount: ${currency(outstanding)}

### Relevant Invoices
${invoiceSummary || "- No recent invoices"}

### Follow-Up Actions
- Confirm payment status for overdue items.
- Escalate high-balance items through the workflow console if needed.
`;
  } else if (kind === "agreement") {
    body = `## Agreement Draft

Title: ${title}
Customer: ${customer?.companyName ?? "Unknown"}
Prompt: ${prompt}

### Scope
- Services and deliverables to be defined by the operator.
- Customer-specific operational context may be attached as exhibits.

### Commercial Context
- Recent order activity indicates ${recentOrders.length} recent orders.
- Outstanding balance currently stands at ${currency(outstanding)}.

### Suggested Clauses
- Payment terms and late-fee handling.
- Delivery, returns, and warranty boundaries.
- Data access and confidentiality rules.
- Connector approval and audit requirements for automated actions.
`;
  } else {
    body = `## Operational Brief

Title: ${title}
Prompt: ${prompt}

### Customer
- ${customer?.companyName ?? "Unknown"}

### Context
${orderSummary || "- No recent order context"}

### Product Signals
${topProducts.map((product) => `- ${product.name} (${product.sku})`).join("\n")}
`;
  }

  return {
    title,
    contentMarkdown: `# ${title}\n\n${body}`.trim(),
    metadata: {
      prompt,
      kind,
      customerId,
      generatedAt: new Date().toISOString(),
    },
  };
}

export async function createGeneratedDocument(input: {
  db: Db;
  customerId: number;
  ownerUserId: number;
  kind: DocumentKind;
  title: string;
  prompt: string;
}) {
  const now = new Date().toISOString();
  const built = await buildDocumentContent(
    input.db,
    input.customerId,
    input.kind,
    input.title,
    input.prompt,
  );

  const [document] = input.db
    .insert(documents)
    .values({
      customerId: input.customerId,
      ownerUserId: input.ownerUserId,
      kind: input.kind,
      title: input.title,
      status: "draft",
      currentVersionNumber: 1,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .all();

  const filePath = await persistDocumentFile(
    document!.id,
    1,
    built.contentMarkdown,
    built.metadata,
  );

  const [version] = input.db
    .insert(documentVersions)
    .values({
      documentId: document!.id,
      versionNumber: 1,
      title: built.title,
      contentMarkdown: built.contentMarkdown,
      contentHtml: null,
      metadata: JSON.stringify(built.metadata),
      filePath,
      createdByUserId: input.ownerUserId,
      createdAt: now,
    })
    .returning()
    .all();

  return { document: document!, version: version! };
}
