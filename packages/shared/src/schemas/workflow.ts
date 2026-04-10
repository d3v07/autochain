import { z } from "zod";
import { AssistantMode, AutonomyLevel, UserRole } from "./auth.js";

export const WorkflowRunStatus = z.enum([
  "planned",
  "running",
  "waiting_approval",
  "completed",
  "failed",
  "cancelled",
  "expired",
]);
export type WorkflowRunStatus = z.infer<typeof WorkflowRunStatus>;

export const WorkflowStepStatus = z.enum([
  "pending",
  "approved",
  "running",
  "completed",
  "failed",
  "cancelled",
  "skipped",
]);
export type WorkflowStepStatus = z.infer<typeof WorkflowStepStatus>;

export const WorkflowStepActionType = z.enum([
  "navigate",
  "query",
  "generate",
  "mutate",
  "connector",
]);
export type WorkflowStepActionType = z.infer<typeof WorkflowStepActionType>;

export const WorkflowAgentRole = z.enum([
  "orchestrator",
  "ops_analyst",
  "finance_analyst",
  "inventory_analyst",
  "supplier_manager",
  "logistics_coordinator",
  "document_specialist",
  "risk_guardian",
  "comms_coordinator",
]);
export type WorkflowAgentRole = z.infer<typeof WorkflowAgentRole>;

export const WorkflowOrchestrationStrategy = z.enum([
  "serial_handoff",
  "parallel_fanout",
  "approval_gated",
]);
export type WorkflowOrchestrationStrategy = z.infer<
  typeof WorkflowOrchestrationStrategy
>;

export const WorkflowAgent = z.object({
  role: WorkflowAgentRole,
  label: z.string(),
  objective: z.string(),
  capabilities: z.array(z.string()).default([]),
});
export type WorkflowAgent = z.infer<typeof WorkflowAgent>;

export const WorkflowOrchestration = z.object({
  enabled: z.boolean().default(true),
  coordinatorRole: WorkflowAgentRole,
  strategy: WorkflowOrchestrationStrategy,
  summary: z.string(),
  agents: z.array(WorkflowAgent).min(1),
  assignments: z.record(z.string(), WorkflowAgentRole).default({}),
});
export type WorkflowOrchestration = z.infer<typeof WorkflowOrchestration>;

export const WorkflowStep = z.object({
  id: z.number(),
  stepNumber: z.number(),
  title: z.string(),
  actionKey: z.string(),
  actionType: WorkflowStepActionType,
  target: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  status: WorkflowStepStatus,
  requiresApproval: z.boolean(),
  retryCount: z.number(),
  maxRetries: z.number(),
  lastError: z.string().nullable(),
  checkpointData: z.record(z.string(), z.unknown()),
  agentRole: WorkflowAgentRole.nullable().optional(),
  dependsOnStepNumbers: z.array(z.number()).optional(),
  parallelGroup: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkflowStep = z.infer<typeof WorkflowStep>;

export const WorkflowEvent = z.object({
  id: z.number(),
  runId: z.number(),
  stepId: z.number().nullable(),
  eventType: z.string(),
  message: z.string(),
  data: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});
export type WorkflowEvent = z.infer<typeof WorkflowEvent>;

export const WorkflowArtifact = z.object({
  id: z.number(),
  runId: z.number(),
  stepId: z.number().nullable(),
  kind: z.string(),
  title: z.string(),
  path: z.string().nullable(),
  data: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});
export type WorkflowArtifact = z.infer<typeof WorkflowArtifact>;

export const WorkflowRun = z.object({
  id: z.number(),
  customerId: z.number(),
  userId: z.number(),
  role: UserRole,
  sessionId: z.number().nullable(),
  mode: AssistantMode,
  autonomy: AutonomyLevel,
  sandbox: z.literal("app"),
  task: z.string(),
  status: WorkflowRunStatus,
  currentStepIndex: z.number(),
  retryCount: z.number(),
  maxRetries: z.number(),
  lastError: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  expiresAt: z.string(),
  orchestration: WorkflowOrchestration.nullable().optional(),
  steps: z.array(WorkflowStep),
  events: z.array(WorkflowEvent).optional(),
  artifacts: z.array(WorkflowArtifact).optional(),
});
export type WorkflowRun = z.infer<typeof WorkflowRun>;

export const SandboxAction = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
  route: z.string(),
  dataAgentId: z.string(),
  actionType: WorkflowStepActionType,
  sideEffect: z.boolean(),
  requiresApproval: z.boolean(),
  roles: z.array(UserRole),
  tags: z.array(z.string()),
});
export type SandboxAction = z.infer<typeof SandboxAction>;

export const CreateWorkflowRunRequest = z.object({
  task: z.string().min(3),
  actionKeys: z.array(z.string()).optional(),
  orchestration: WorkflowOrchestration.optional(),
});
export type CreateWorkflowRunRequest = z.infer<typeof CreateWorkflowRunRequest>;
