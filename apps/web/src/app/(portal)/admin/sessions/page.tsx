"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/status-badge";
import { ThinkingIndicator } from "@/components/thinking-indicator";

interface AdminSession {
  id: number;
  userId: number;
  customerId: number;
  companyName: string;
  email: string;
  role: "customer" | "vendor" | "admin";
  mode: "text" | "voice" | "video" | "agentic";
  autonomy: "manual" | "ask" | "agent";
  ipAddress: string | null;
  userAgent: string | null;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export default function AdminSessionsPage() {
  const { token, user } = useAuth();
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [pendingSessionId, setPendingSessionId] = useState<number | null>(null);

  async function loadSessions() {
    if (!token || user?.role !== "admin") return;
    const res = await api<{ data: AdminSession[] }>(
      "/api/admin/sessions?limit=200",
      { token },
    );
    setSessions(res.data);
  }

  useEffect(() => {
    if (!token || user?.role !== "admin") return;

    loadSessions()
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "Failed to load sessions",
        ),
      )
      .finally(() => setLoading(false));
  }, [token, user?.role]);

  async function revokeSession(sessionId: number) {
    if (!token) return;

    setSubmitting(true);
    setError("");
    setPendingSessionId(sessionId);

    try {
      await api(`/api/admin/sessions/${sessionId}/revoke`, {
        method: "POST",
        token,
      });
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke session");
    } finally {
      setSubmitting(false);
      setPendingSessionId(null);
    }
  }

  if (user?.role !== "admin") {
    return <p className="text-sm text-danger">Admin access required.</p>;
  }

  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <ThinkingIndicator size="md" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-foreground">Sessions</h1>
      <p className="mt-1 text-sm text-muted">
        Review live sessions and revoke risky or stale access
      </p>

      {error && (
        <div className="mt-4 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="mt-6 rounded border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2">User</th>
              <th className="px-4 py-2">Company</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Mode</th>
              <th className="px-4 py-2">Autonomy</th>
              <th className="px-4 py-2">Last Seen</th>
              <th className="px-4 py-2">Client</th>
              <th className="px-4 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr
                key={session.id}
                className="border-b border-border last:border-0"
              >
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">{session.email}</p>
                  <p className="text-xs text-muted">
                    {session.ipAddress ?? "n/a"}
                  </p>
                </td>
                <td className="px-4 py-3">{session.companyName}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={session.role} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={session.mode} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={session.autonomy} />
                </td>
                <td className="px-4 py-3 text-muted">
                  {new Date(session.lastSeenAt).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <p>{session.userAgent ?? "Unknown client"}</p>
                  <p className="text-xs text-muted">
                    Expires {new Date(session.expiresAt).toLocaleString()}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => revokeSession(session.id)}
                    className="rounded border border-danger/30 px-2 py-1 text-xs text-danger hover:bg-danger/10"
                  >
                    {pendingSessionId === session.id ? (
                      <ThinkingIndicator className="justify-center" />
                    ) : (
                      "Revoke"
                    )}
                  </button>
                </td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-muted">
                  No active sessions found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
