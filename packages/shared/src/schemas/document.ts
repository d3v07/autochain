import { z } from "zod";

export const DocumentKind = z.enum(["report", "invoice", "agreement", "brief"]);
export type DocumentKind = z.infer<typeof DocumentKind>;

export const DocumentStatus = z.enum(["draft", "published", "archived"]);
export type DocumentStatus = z.infer<typeof DocumentStatus>;

export const DocumentVersion = z.object({
  id: z.number(),
  versionNumber: z.number(),
  title: z.string(),
  contentMarkdown: z.string(),
  contentHtml: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  filePath: z.string().nullable(),
  createdByUserId: z.number(),
  createdAt: z.string(),
});
export type DocumentVersion = z.infer<typeof DocumentVersion>;

export const DocumentRecord = z.object({
  id: z.number(),
  customerId: z.number(),
  ownerUserId: z.number(),
  kind: DocumentKind,
  title: z.string(),
  status: DocumentStatus,
  currentVersionNumber: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  versions: z.array(DocumentVersion).optional(),
});
export type DocumentRecord = z.infer<typeof DocumentRecord>;

export const CreateDocumentRequest = z.object({
  kind: DocumentKind,
  title: z.string().min(3),
  prompt: z.string().min(3),
});
export type CreateDocumentRequest = z.infer<typeof CreateDocumentRequest>;
