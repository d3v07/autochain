import { z } from "zod";
import { AccountType } from "./auth.js";

export const CustomerStatus = z.enum(["active", "inactive", "suspended"]);
export type CustomerStatus = z.infer<typeof CustomerStatus>;

export const Customer = z.object({
  id: z.number(),
  companyName: z.string().min(1),
  contactEmail: z.string().email(),
  contactName: z.string().min(1),
  accountNumber: z.string().min(1),
  accountType: AccountType.default("client"),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  status: CustomerStatus,
  createdAt: z.string().datetime(),
});
export type Customer = z.infer<typeof Customer>;

export const CreateCustomer = Customer.omit({ id: true, createdAt: true });
export type CreateCustomer = z.infer<typeof CreateCustomer>;
