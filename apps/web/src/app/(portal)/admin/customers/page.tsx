"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/status-badge";
import { ThinkingIndicator } from "@/components/thinking-indicator";

interface AdminCustomer {
  id: number;
  companyName: string;
  contactName: string;
  contactEmail: string;
  accountNumber: string;
  status: string;
  city: string | null;
  state: string | null;
  orderCount: number;
  outstandingBalance: number;
  overdueInvoiceCount: number;
  activeSessionCount: number;
  healthScore: number;
  riskLevel: "healthy" | "watch" | "risk";
  lastActivityAt: string | null;
}

export default function AdminCustomersPage() {
  const { token, user } = useAuth();
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || user?.role !== "admin") return;

    api<{ data: AdminCustomer[] }>("/api/admin/customers?limit=100", { token })
      .then((res) => setCustomers(res.data))
      .finally(() => setLoading(false));
  }, [token, user?.role]);

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
      <h1 className="text-xl font-bold text-foreground">Customers</h1>
      <p className="mt-1 text-sm text-muted">
        Customer status, order volume, and balances
      </p>

      <div className="mt-4 rounded border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2">Company</th>
              <th className="px-4 py-2">Account</th>
              <th className="px-4 py-2">Risk</th>
              <th className="px-4 py-2 text-right">Orders</th>
              <th className="px-4 py-2 text-right">Outstanding</th>
              <th className="px-4 py-2 text-right">Sessions</th>
              <th className="px-4 py-2 text-right">Health</th>
              <th className="px-4 py-2">Contact</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr
                key={customer.id}
                className="border-b border-border last:border-0"
              >
                <td className="px-4 py-2">
                  <p className="font-medium text-foreground">
                    {customer.companyName}
                  </p>
                  <p className="text-xs text-muted">
                    {customer.city ?? ""}
                    {customer.city && customer.state ? ", " : ""}
                    {customer.state ?? ""}
                  </p>
                </td>
                <td className="px-4 py-2 font-mono text-xs">
                  {customer.accountNumber}
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={customer.riskLevel} />
                    <StatusBadge status={customer.status} />
                  </div>
                </td>
                <td className="px-4 py-2 text-right">{customer.orderCount}</td>
                <td className="px-4 py-2 text-right font-mono">
                  $
                  {customer.outstandingBalance.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}
                </td>
                <td className="px-4 py-2 text-right">
                  {customer.activeSessionCount}
                </td>
                <td className="px-4 py-2 text-right">
                  <span className="font-medium">{customer.healthScore}</span>
                  <p className="text-[10px] text-muted">
                    {customer.lastActivityAt
                      ? new Date(customer.lastActivityAt).toLocaleDateString()
                      : "No activity"}
                  </p>
                </td>
                <td className="px-4 py-2">
                  <p>{customer.contactName}</p>
                  <p className="text-xs text-muted">{customer.contactEmail}</p>
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-muted">
                  No customers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
