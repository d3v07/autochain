import { z } from "zod";
import { AccountType, UserRole } from "./auth.js";

export const VendorProfile = z.object({
  id: z.number(),
  customerId: z.number(),
  vendorCode: z.string(),
  categoryFocus: z.string(),
  paymentTerms: z.string(),
  leadTimeDays: z.number(),
  reliabilityScore: z.number(),
  preferredShippingMethod: z.string().nullable(),
  operationsEmail: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type VendorProfile = z.infer<typeof VendorProfile>;

export const VendorCatalogStatus = z.enum(["active", "constrained", "paused"]);
export type VendorCatalogStatus = z.infer<typeof VendorCatalogStatus>;

export const VendorCatalogItem = z.object({
  id: z.number(),
  vendorCustomerId: z.number(),
  productId: z.number(),
  vendorSku: z.string(),
  productName: z.string(),
  productCategory: z.string(),
  unitCost: z.number(),
  minimumOrderQty: z.number(),
  leadTimeDays: z.number(),
  availableQty: z.number(),
  status: VendorCatalogStatus,
  updatedAt: z.string(),
});
export type VendorCatalogItem = z.infer<typeof VendorCatalogItem>;

export const PurchaseOrderStatus = z.enum([
  "draft",
  "sent",
  "confirmed",
  "in_production",
  "shipped",
  "received",
  "cancelled",
]);
export type PurchaseOrderStatus = z.infer<typeof PurchaseOrderStatus>;

export const PurchaseOrderRecord = z.object({
  id: z.number(),
  vendorCustomerId: z.number(),
  issuedByUserId: z.number(),
  purchaseOrderNumber: z.string(),
  status: PurchaseOrderStatus,
  expectedShipDate: z.string().nullable(),
  total: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PurchaseOrderRecord = z.infer<typeof PurchaseOrderRecord>;

export const VendorInvoiceStatus = z.enum([
  "pending",
  "approved",
  "paid",
  "disputed",
]);
export type VendorInvoiceStatus = z.infer<typeof VendorInvoiceStatus>;

export const VendorInvoiceRecord = z.object({
  id: z.number(),
  purchaseOrderId: z.number(),
  vendorCustomerId: z.number(),
  invoiceNumber: z.string(),
  amount: z.number(),
  status: VendorInvoiceStatus,
  dueDate: z.string(),
  paidAt: z.string().nullable(),
  createdAt: z.string(),
});
export type VendorInvoiceRecord = z.infer<typeof VendorInvoiceRecord>;

export const VendorShipmentRecord = z.object({
  id: z.number(),
  purchaseOrderId: z.number(),
  carrier: z.string(),
  trackingNumber: z.string(),
  status: z.enum(["pending", "in_transit", "delivered", "delayed"]),
  estimatedDelivery: z.string().nullable(),
  events: z.array(z.record(z.string(), z.unknown())),
  createdAt: z.string(),
});
export type VendorShipmentRecord = z.infer<typeof VendorShipmentRecord>;

export const VendorDashboardResponse = z.object({
  accountType: AccountType,
  role: UserRole,
  companyName: z.string(),
  accountNumber: z.string(),
  vendorProfile: VendorProfile,
  metrics: z.object({
    openPurchaseOrders: z.number(),
    inTransitShipments: z.number(),
    pendingInvoices: z.number(),
    constrainedCatalogItems: z.number(),
    catalogValue: z.number(),
  }),
  purchaseOrders: z.array(PurchaseOrderRecord),
  invoices: z.array(VendorInvoiceRecord),
  shipments: z.array(VendorShipmentRecord),
  catalogItems: z.array(VendorCatalogItem),
});
export type VendorDashboardResponse = z.infer<typeof VendorDashboardResponse>;

export const ChatCacheRecord = z.object({
  id: z.number(),
  customerId: z.number(),
  userId: z.number().nullable(),
  sessionId: z.number().nullable(),
  role: UserRole,
  sourceMode: z.enum(["text", "voice", "video", "agentic"]),
  normalizedPrompt: z.string(),
  promptLabel: z.string(),
  hitCount: z.number(),
  lastResponse: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ChatCacheRecord = z.infer<typeof ChatCacheRecord>;
