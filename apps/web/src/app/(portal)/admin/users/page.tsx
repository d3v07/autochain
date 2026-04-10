"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/status-badge";
import { ThinkingIndicator } from "@/components/thinking-indicator";

interface AdminUser {
  id: number;
  customerId: number;
  companyName: string;
  email: string;
  role: "customer" | "vendor" | "admin";
  status: "active" | "disabled";
  mustResetPassword: boolean;
  featureFlags: string[];
  lastLoginAt: string | null;
  activeSessionCount: number;
  createdAt: string;
  updatedAt: string;
}

interface CustomerOption {
  id: number;
  companyName: string;
}

export default function AdminUsersPage() {
  const { token, user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: "",
    customerId: "",
    role: "customer" as "customer" | "vendor" | "admin",
  });

  async function loadData() {
    if (!token || user?.role !== "admin") return;

    const [usersRes, customersRes] = await Promise.all([
      api<{ data: AdminUser[] }>("/api/admin/users?limit=100", { token }),
      api<{ data: CustomerOption[] }>("/api/customers?limit=100", { token }),
    ]);

    setUsers(usersRes.data);
    setCustomers(customersRes.data);
  }

  useEffect(() => {
    if (!token || user?.role !== "admin") return;

    loadData()
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load users"),
      )
      .finally(() => setLoading(false));
  }, [token, user?.role]);

  async function handleCreateUser() {
    if (!token || !form.email || !form.customerId) return;

    setSubmitting(true);
    setError("");
    setTempPassword(null);
    setPendingAction("create-user");

    try {
      const res = await api<{
        data: AdminUser & { temporaryPassword: string | null };
      }>("/api/admin/users", {
        method: "POST",
        token,
        body: {
          email: form.email,
          customerId: Number(form.customerId),
          role: form.role,
        },
      });

      setTempPassword(res.data.temporaryPassword);
      setForm({ email: "", customerId: "", role: "customer" });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setSubmitting(false);
      setPendingAction(null);
    }
  }

  async function updateUser(
    userId: number,
    actionKey: string,
    patch: Record<string, unknown>,
    successPassword?: string | null,
  ) {
    if (!token) return;

    setSubmitting(true);
    setError("");
    setTempPassword(successPassword ?? null);
    setPendingAction(actionKey);

    try {
      await api(`/api/admin/users/${userId}`, {
        method: "PATCH",
        token,
        body: patch,
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setSubmitting(false);
      setPendingAction(null);
    }
  }

  async function resetPassword(userId: number) {
    if (!token) return;

    setSubmitting(true);
    setError("");
    setPendingAction(`reset-password-${userId}`);

    try {
      const res = await api<{
        data: { temporaryPassword: string; mustResetPassword: boolean };
      }>(`/api/admin/users/${userId}/reset-password`, {
        method: "POST",
        token,
      });
      setTempPassword(res.data.temporaryPassword);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setSubmitting(false);
      setPendingAction(null);
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
      <h1 className="text-xl font-bold text-foreground">Users</h1>
      <p className="mt-1 text-sm text-muted">
        Create users, disable access, reset passwords, and adjust roles
      </p>

      {error && (
        <div className="mt-4 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {tempPassword && (
        <div className="mt-4 rounded border border-ai/30 bg-ai-light/30 px-3 py-2 text-sm text-ai-foreground">
          Temporary password: <span className="font-mono">{tempPassword}</span>
        </div>
      )}

      <div className="mt-6 rounded border border-border bg-surface p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Create User
        </h2>
        <div className="mt-3 grid grid-cols-[1.6fr_1fr_1fr_auto] gap-3">
          <input
            type="email"
            value={form.email}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, email: e.target.value }))
            }
            placeholder="user@company.com"
            className="rounded border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
          <select
            value={form.customerId}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, customerId: e.target.value }))
            }
            className="rounded border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
          >
            <option value="">Select customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.companyName}
              </option>
            ))}
          </select>
          <select
            value={form.role}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                role: e.target.value as "customer" | "vendor" | "admin",
              }))
            }
            className="rounded border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
          >
            <option value="customer">Client</option>
            <option value="vendor">Vendor</option>
            <option value="admin">Admin</option>
          </select>
          <button
            type="button"
            disabled={submitting || !form.email || !form.customerId}
            onClick={handleCreateUser}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {pendingAction === "create-user" ? (
              <ThinkingIndicator tone="light" className="justify-center" />
            ) : (
              "Create"
            )}
          </button>
        </div>
      </div>

      <div className="mt-6 rounded border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2">User</th>
              <th className="px-4 py-2">Company</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Sessions</th>
              <th className="px-4 py-2">Last Login</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((entry) => (
              <tr
                key={entry.id}
                className="border-b border-border last:border-0"
              >
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">{entry.email}</p>
                  <p className="text-xs text-muted">
                    {entry.mustResetPassword
                      ? "Password reset required"
                      : entry.featureFlags.join(", ") || "Default flags"}
                  </p>
                </td>
                <td className="px-4 py-3">{entry.companyName}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={entry.role} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={entry.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  {entry.activeSessionCount}
                </td>
                <td className="px-4 py-3 text-muted">
                  {entry.lastLoginAt
                    ? new Date(entry.lastLoginAt).toLocaleString()
                    : "Never"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() =>
                        updateUser(entry.id, `toggle-status-${entry.id}`, {
                          status:
                            entry.status === "active" ? "disabled" : "active",
                        })
                      }
                      className="rounded border border-border px-2 py-1 text-xs text-foreground hover:bg-background"
                    >
                      {pendingAction === `toggle-status-${entry.id}` ? (
                        <ThinkingIndicator className="justify-center" />
                      ) : entry.status === "active" ? (
                        "Disable"
                      ) : (
                        "Enable"
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() =>
                        updateUser(entry.id, `toggle-role-${entry.id}`, {
                          role:
                            entry.role === "admin"
                              ? "customer"
                              : entry.role === "customer"
                                ? "vendor"
                                : "admin",
                        })
                      }
                      className="rounded border border-border px-2 py-1 text-xs text-foreground hover:bg-background"
                    >
                      {pendingAction === `toggle-role-${entry.id}` ? (
                        <ThinkingIndicator className="justify-center" />
                      ) : (
                        `Make ${
                          entry.role === "admin"
                            ? "Client"
                            : entry.role === "customer"
                              ? "Vendor"
                              : "Admin"
                        }`
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => resetPassword(entry.id)}
                      className="rounded border border-ai/30 px-2 py-1 text-xs text-ai-foreground hover:bg-ai-light/40"
                    >
                      {pendingAction === `reset-password-${entry.id}` ? (
                        <ThinkingIndicator className="justify-center" />
                      ) : (
                        "Reset Password"
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
