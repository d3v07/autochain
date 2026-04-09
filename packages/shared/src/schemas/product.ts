import { z } from "zod";

export const ProductCategory = z.enum([
  "windows",
  "doors",
  "hardware",
  "glass",
  "weatherstripping",
  "frames",
  "accessories",
]);
export type ProductCategory = z.infer<typeof ProductCategory>;

export const Product = z.object({
  id: z.number(),
  sku: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  category: ProductCategory,
  unitPrice: z.number().positive(),
  createdAt: z.string().datetime(),
});
export type Product = z.infer<typeof Product>;

export const InventoryLevel = z.object({
  id: z.number(),
  productId: z.number(),
  quantityAvailable: z.number().int().min(0),
  quantityReserved: z.number().int().min(0),
  warehouse: z.string(),
  updatedAt: z.string().datetime(),
});
export type InventoryLevel = z.infer<typeof InventoryLevel>;

export const ProductWithInventory = Product.extend({
  quantityAvailable: z.number().int().min(0),
  quantityReserved: z.number().int().min(0),
});
export type ProductWithInventory = z.infer<typeof ProductWithInventory>;

export const CustomerPrice = z.object({
  customerId: z.number(),
  productId: z.number(),
  customPrice: z.number().positive().nullable(),
  discountPct: z.number().min(0).max(100).nullable(),
});
export type CustomerPrice = z.infer<typeof CustomerPrice>;
