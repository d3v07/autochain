import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const STORAGE_ROOT = path.join(process.cwd(), "storage");

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

function toStorageRef(filePath: string) {
  return path.relative(process.cwd(), filePath).split(path.sep).join("/");
}

export async function persistDocumentFile(
  documentId: number,
  versionNumber: number,
  contentMarkdown: string,
  metadata: Record<string, unknown>,
) {
  const dir = path.join(STORAGE_ROOT, "documents", String(documentId));
  await ensureDir(dir);

  const base = `v${versionNumber}`;
  const markdownPath = path.join(dir, `${base}.md`);
  const metadataPath = path.join(dir, `${base}.json`);

  await writeFile(markdownPath, contentMarkdown, "utf8");
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf8");

  return toStorageRef(markdownPath);
}

export async function persistWorkflowArtifact(
  runId: number,
  artifactTitle: string,
  data: Record<string, unknown>,
) {
  const dir = path.join(STORAGE_ROOT, "workflows", String(runId));
  await ensureDir(dir);

  const safeTitle = artifactTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const artifactPath = path.join(dir, `${safeTitle || "artifact"}.json`);

  await writeFile(artifactPath, JSON.stringify(data, null, 2), "utf8");
  return toStorageRef(artifactPath);
}
