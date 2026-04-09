import type { App } from "../types.js";
import { customerRoutes } from "./customers.js";
import { productRoutes } from "./products.js";
import { orderRoutes } from "./orders.js";
import { authRoutes } from "./auth.js";
import { invoiceRoutes } from "./invoices.js";
import { chatRoutes } from "./chat.js";
import { insightsRoutes } from "./insights.js";
import { adminRoutes } from "./admin.js";
import { shipmentRoutes } from "./shipments.js";
import { ediRoutes } from "./edi.js";
import { aiRoutes } from "./ai.js";
import { documentRoutes } from "./documents.js";
import { memoryRoutes } from "./memory.js";
import { workflowRoutes } from "./workflows.js";
import { connectorRoutes } from "./connectors.js";
import { vendorRoutes } from "./vendors.js";

export async function registerRoutes(app: App) {
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(customerRoutes, { prefix: "/api/customers" });
  await app.register(productRoutes, { prefix: "/api/products" });
  await app.register(orderRoutes, { prefix: "/api/orders" });
  await app.register(invoiceRoutes, { prefix: "/api/invoices" });
  await app.register(chatRoutes, { prefix: "/api/chat" });
  await app.register(insightsRoutes, { prefix: "/api/insights" });
  await app.register(adminRoutes, { prefix: "/api/admin" });
  await app.register(shipmentRoutes, { prefix: "/api/shipments" });
  await app.register(ediRoutes, { prefix: "/api/edi" });
  await app.register(aiRoutes, { prefix: "/api/ai" });
  await app.register(documentRoutes, { prefix: "/api/documents" });
  await app.register(memoryRoutes, { prefix: "/api/memory" });
  await app.register(workflowRoutes, { prefix: "/api/workflows" });
  await app.register(connectorRoutes, { prefix: "/api/connectors" });
  await app.register(vendorRoutes, { prefix: "/api/vendors" });
}
