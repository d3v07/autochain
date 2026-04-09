import { z } from "zod";

export const MemoryScope = z.enum(["tenant", "user", "workflow"]);
export type MemoryScope = z.infer<typeof MemoryScope>;

export const MemoryItem = z.object({
  id: z.number(),
  customerId: z.number(),
  userId: z.number().nullable(),
  workflowRunId: z.number().nullable(),
  scope: MemoryScope,
  namespace: z.string(),
  title: z.string(),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  sourceType: z.string(),
  sourceId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MemoryItem = z.infer<typeof MemoryItem>;

export const CreateMemoryItemRequest = z.object({
  scope: MemoryScope,
  namespace: z.string().min(1),
  title: z.string().min(2),
  content: z.string().min(2),
  metadata: z.record(z.string(), z.unknown()).default({}),
  sourceType: z.string().default("manual"),
  sourceId: z.string().optional(),
  workflowRunId: z.number().int().positive().optional(),
});
export type CreateMemoryItemRequest = z.infer<typeof CreateMemoryItemRequest>;
