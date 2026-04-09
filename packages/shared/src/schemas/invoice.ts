import { z } from "zod";

export const InvoiceStatus = z.enum(["pending", "paid", "overdue"]);
export type InvoiceStatus = z.infer<typeof InvoiceStatus>;

export const Invoice = z.object({
  id: z.number(),
  orderId: z.number(),
  customerId: z.number(),
  invoiceNumber: z.string(),
  amount: z.number().positive(),
  status: InvoiceStatus,
  dueDate: z.string(),
  paidAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type Invoice = z.infer<typeof Invoice>;
