"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/status-badge";
import { ThinkingIndicator } from "@/components/thinking-indicator";

interface DocumentVersion {
  id: number;
  versionNumber: number;
  title: string;
  contentMarkdown: string;
  contentHtml: string | null;
  metadata: Record<string, unknown>;
  filePath: string | null;
  createdByUserId: number;
  createdAt: string;
}

interface DocumentRecord {
  id: number;
  customerId: number;
  ownerUserId: number;
  kind: "report" | "invoice" | "agreement" | "brief";
  title: string;
  status: "draft" | "published" | "archived";
  currentVersionNumber: number;
  createdAt: string;
  updatedAt: string;
  versions?: DocumentVersion[];
}

export default function DocumentsPage() {
  const { token } = useAuth();
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [selected, setSelected] = useState<DocumentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    kind: "report",
    title: "Monthly Summary",
    prompt: "Generate a monthly summary for the current account.",
  });

  async function loadDocuments() {
    if (!token) return;
    const res = await api<{ data: DocumentRecord[] }>(
      "/api/documents?limit=100",
      {
        token,
      },
    );
    setDocuments(res.data);
  }

  async function loadDocument(id: number) {
    if (!token) return;
    const res = await api<{ data: DocumentRecord }>(`/api/documents/${id}`, {
      token,
    });
    setSelected(res.data);
  }

  useEffect(() => {
    if (!token) return;

    loadDocuments()
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "Failed to load documents",
        ),
      )
      .finally(() => setLoading(false));
  }, [token]);

  async function createDocument() {
    if (!token) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await api<{ data: DocumentRecord }>("/api/documents", {
        method: "POST",
        token,
        body: form,
      });
      await loadDocuments();
      setSelected(res.data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate document",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const latestVersion = selected?.versions?.[0] ?? null;

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div>
        <h1 className="text-xl font-bold text-foreground">Document Studio</h1>
        <p className="mt-1 text-sm text-muted">
          Generate reports, invoice drafts, agreements, and operational briefs
        </p>

        {error && (
          <div className="mt-4 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="mt-6 rounded border border-border bg-surface p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
            New Document
          </h2>
          <div className="mt-3 space-y-3">
            <select
              value={form.kind}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, kind: e.target.value }))
              }
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              <option value="report">Report</option>
              <option value="invoice">Invoice Review</option>
              <option value="agreement">Agreement</option>
              <option value="brief">Brief</option>
            </select>
            <input
              value={form.title}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, title: e.target.value }))
              }
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
            <textarea
              value={form.prompt}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, prompt: e.target.value }))
              }
              rows={5}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              data-agent-id={`doc-generate-${form.kind}`}
              disabled={submitting}
              onClick={createDocument}
              className="w-full rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {submitting ? (
                <ThinkingIndicator tone="light" className="justify-center" />
              ) : (
                "Generate Document"
              )}
            </button>
          </div>
        </div>

        <div className="mt-6 rounded border border-border bg-surface">
          {loading ? (
            <div className="px-4 py-6">
              <ThinkingIndicator className="justify-center" />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {documents.map((document) => (
                <button
                  key={document.id}
                  type="button"
                  onClick={() => loadDocument(document.id)}
                  className="flex w-full items-start justify-between px-4 py-3 text-left hover:bg-background"
                >
                  <div>
                    <p className="font-medium text-foreground">
                      {document.title}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      v{document.currentVersionNumber} ·{" "}
                      {new Date(document.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={document.kind} />
                    <StatusBadge status={document.status} />
                  </div>
                </button>
              ))}
              {documents.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-muted">
                  No documents generated yet.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="rounded border border-border bg-surface p-5">
        {selected && latestVersion ? (
          <div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  {selected.title}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {selected.kind} · version {latestVersion.versionNumber}
                </p>
              </div>
              <div className="flex gap-2">
                <StatusBadge status={selected.kind} />
                <StatusBadge status={selected.status} />
              </div>
            </div>

            <div className="mt-4 rounded border border-border bg-background p-4">
              <pre className="whitespace-pre-wrap text-sm text-foreground">
                {latestVersion.contentMarkdown}
              </pre>
            </div>

            <div className="mt-4 text-xs text-muted">
              <p>Saved file: {latestVersion.filePath ?? "Not persisted"}</p>
              <p>
                Generated: {new Date(latestVersion.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-[420px] items-center justify-center text-sm text-muted">
            Select a document to inspect its latest version.
          </div>
        )}
      </div>
    </div>
  );
}
