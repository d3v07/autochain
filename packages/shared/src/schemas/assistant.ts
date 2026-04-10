import { z } from "zod";
import { AssistantMode, UserRole } from "./auth.js";
import { DocumentKind } from "./document.js";
import { WorkflowOrchestration } from "./workflow.js";

export const AssistantSessionStatus = z.enum([
  "active",
  "paused",
  "completed",
  "cancelled",
]);
export type AssistantSessionStatus = z.infer<typeof AssistantSessionStatus>;

export const AssistantEntryRole = z.enum(["user", "assistant", "system"]);
export type AssistantEntryRole = z.infer<typeof AssistantEntryRole>;

export const AssistantEntryType = z.enum([
  "message",
  "transcript",
  "speech",
  "visual",
  "plan",
  "event",
  "summary",
  "artifact",
]);
export type AssistantEntryType = z.infer<typeof AssistantEntryType>;

export const AssistantEntry = z.object({
  id: z.number(),
  sessionId: z.number(),
  role: AssistantEntryRole,
  entryType: AssistantEntryType,
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});
export type AssistantEntry = z.infer<typeof AssistantEntry>;

export const AssistantSession = z.object({
  id: z.number(),
  customerId: z.number(),
  userId: z.number(),
  role: UserRole,
  mode: AssistantMode,
  title: z.string(),
  status: AssistantSessionStatus,
  sourcePage: z.string().nullable(),
  linkedWorkflowRunId: z.number().nullable(),
  linkedDocumentId: z.number().nullable(),
  lastError: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  entries: z.array(AssistantEntry).optional(),
});
export type AssistantSession = z.infer<typeof AssistantSession>;

export const CreateAssistantSessionRequest = z.object({
  mode: AssistantMode,
  title: z.string().min(2).optional(),
  sourcePage: z.string().optional(),
});
export type CreateAssistantSessionRequest = z.infer<
  typeof CreateAssistantSessionRequest
>;

export const AddAssistantEntryRequest = z.object({
  role: AssistantEntryRole,
  entryType: AssistantEntryType,
  content: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type AddAssistantEntryRequest = z.infer<typeof AddAssistantEntryRequest>;

export const VoiceTurnRequest = z.object({
  transcript: z.string().min(1),
  shouldSpeak: z.boolean().default(true),
});
export type VoiceTurnRequest = z.infer<typeof VoiceTurnRequest>;

export const VisualContextRequest = z.object({
  title: z.string().min(2),
  description: z.string().min(2),
  fileName: z.string().optional(),
  fileType: z.string().optional(),
  fileSize: z.number().nonnegative().optional(),
});
export type VisualContextRequest = z.infer<typeof VisualContextRequest>;

export const SessionDocumentRequest = z.object({
  kind: DocumentKind,
  title: z.string().min(3),
});
export type SessionDocumentRequest = z.infer<typeof SessionDocumentRequest>;

export const SessionWorkflowRequest = z.object({
  task: z.string().min(3),
  actionKeys: z.array(z.string()).optional(),
  orchestration: WorkflowOrchestration.optional(),
});
export type SessionWorkflowRequest = z.infer<typeof SessionWorkflowRequest>;

export const AssistantWorkspaceOverview = z.object({
  sessions: z.array(AssistantSession),
  frequentPrompts: z.array(
    z.object({
      id: z.number(),
      promptLabel: z.string(),
      hitCount: z.number(),
      sourceMode: AssistantMode,
      updatedAt: z.string(),
    }),
  ),
  pendingApprovals: z.array(
    z.object({
      runId: z.number(),
      task: z.string(),
      status: z.string(),
      stepCount: z.number(),
      approvalCount: z.number(),
      createdAt: z.string(),
    }),
  ),
  recentDocuments: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      kind: DocumentKind,
      status: z.string(),
      updatedAt: z.string(),
    }),
  ),
  recentMemory: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      namespace: z.string(),
      content: z.string(),
      updatedAt: z.string(),
    }),
  ),
  connectors: z.array(
    z.object({
      id: z.number(),
      provider: z.string(),
      accountIdentifier: z.string(),
      status: z.string(),
      updatedAt: z.string(),
    }),
  ),
});
export type AssistantWorkspaceOverview = z.infer<
  typeof AssistantWorkspaceOverview
>;
