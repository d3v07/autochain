import { z } from "zod";

export const OrderStatus = z.enum([
  "draft",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
]);
export type OrderStatus = z.infer<typeof OrderStatus>;

export const ORDER_STATUS_TRANSITIONS: Record<
  OrderStatus,
  readonly OrderStatus[]
> = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
} as const;

export const OrderLine = z.object({
  id: z.number(),
  orderId: z.number(),
  productId: z.number(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
  lineTotal: z.number().positive(),
});
export type OrderLine = z.infer<typeof OrderLine>;

export const Order = z.object({
  id: z.number(),
  customerId: z.number(),
  orderNumber: z.string(),
  status: OrderStatus,
  total: z.number().min(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Order = z.infer<typeof Order>;

export const CreateOrderLine = z.object({
  productId: z.number(),
  quantity: z.number().int().positive(),
});
export type CreateOrderLine = z.infer<typeof CreateOrderLine>;

export const CreateOrder = z.object({
  lines: z.array(CreateOrderLine).min(1),
});
export type CreateOrder = z.infer<typeof CreateOrder>;

export const OrderWithLines = Order.extend({
  lines: z.array(OrderLine),
});
export type OrderWithLines = z.infer<typeof OrderWithLines>;
