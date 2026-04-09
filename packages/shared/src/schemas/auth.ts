import { z } from "zod";

export const UserRole = z.enum(["customer", "vendor", "admin"]);
export type UserRole = z.infer<typeof UserRole>;

export const AccountType = z.enum(["client", "vendor"]);
export type AccountType = z.infer<typeof AccountType>;

export const UserStatus = z.enum(["active", "disabled"]);
export type UserStatus = z.infer<typeof UserStatus>;

export const AssistantMode = z.enum(["text", "voice", "video", "agentic"]);
export type AssistantMode = z.infer<typeof AssistantMode>;

export const AutonomyLevel = z.enum(["manual", "ask", "agent"]);
export type AutonomyLevel = z.infer<typeof AutonomyLevel>;

export const LoginRequest = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const AuthUser = z.object({
  id: z.number(),
  email: z.string().email(),
  role: UserRole,
  status: UserStatus,
  customerId: z.number(),
  companyName: z.string(),
  accountType: AccountType,
  accountNumber: z.string(),
  mustResetPassword: z.boolean(),
  featureFlags: z.array(z.string()),
  availableModes: z.array(AssistantMode),
  availableAutonomy: z.array(AutonomyLevel),
});
export type AuthUser = z.infer<typeof AuthUser>;

export const SessionInfo = z.object({
  id: z.number(),
  mode: AssistantMode,
  autonomy: AutonomyLevel,
  expiresAt: z.string(),
  lastSeenAt: z.string(),
});
export type SessionInfo = z.infer<typeof SessionInfo>;

export const LoginResponse = z.object({
  token: z.string(),
  user: AuthUser,
  session: SessionInfo,
});
export type LoginResponse = z.infer<typeof LoginResponse>;

export const MeResponse = z.object({
  user: AuthUser,
  session: SessionInfo,
});
export type MeResponse = z.infer<typeof MeResponse>;
