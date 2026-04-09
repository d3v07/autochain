import { z } from "zod";
import { AssistantMode, AutonomyLevel, UserRole, UserStatus } from "./auth.js";

export const CreateAdminUserRequest = z.object({
  customerId: z.number().int().positive(),
  email: z.string().email(),
  role: UserRole.default("customer"),
  status: UserStatus.default("active"),
  password: z.string().min(8).optional(),
  featureFlags: z.array(z.string()).default([]),
});
export type CreateAdminUserRequest = z.infer<typeof CreateAdminUserRequest>;

export const UpdateAdminUserRequest = z
  .object({
    customerId: z.number().int().positive().optional(),
    role: UserRole.optional(),
    status: UserStatus.optional(),
    mustResetPassword: z.boolean().optional(),
    featureFlags: z.array(z.string()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateAdminUserRequest = z.infer<typeof UpdateAdminUserRequest>;

export const AdminUserRecord = z.object({
  id: z.number(),
  customerId: z.number(),
  companyName: z.string(),
  email: z.string().email(),
  role: UserRole,
  status: UserStatus,
  mustResetPassword: z.boolean(),
  featureFlags: z.array(z.string()),
  lastLoginAt: z.string().nullable(),
  activeSessionCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminUserRecord = z.infer<typeof AdminUserRecord>;

export const AdminSessionRecord = z.object({
  id: z.number(),
  userId: z.number(),
  customerId: z.number(),
  companyName: z.string(),
  email: z.string().email(),
  role: UserRole,
  mode: AssistantMode,
  autonomy: AutonomyLevel,
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  lastSeenAt: z.string(),
  expiresAt: z.string(),
  revokedAt: z.string().nullable(),
});
export type AdminSessionRecord = z.infer<typeof AdminSessionRecord>;
