"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/status-badge";
import { ThinkingIndicator } from "@/components/thinking-indicator";

interface EdiTransaction {
  id: number;
  orderId: number | null;
  orderNumber: string | null;
  customerId: number | null;
  companyName: string | null;
  type: string;
  direction: string;
  status: string;
  payload: string;
  createdAt: string;
}

export default function EdiPage() {
  const { token, user } = useAuth();
  const [transactions, setTransactions] = useState<EdiTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;

    api<{ data: EdiTransaction[] }>("/api/edi/transactions", { token })
      .then((res) => setTransactions(res.data))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <ThinkingIndicator size="md" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-foreground">EDI Transaction Log</h1>
      <p className="mt-1 text-sm text-muted">
        {user?.role === "admin"
          ? "All customer EDI traffic"
          : "Your customer EDI traffic"}
      </p>

      <div className="mt-4 rounded border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Direction</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Order</th>
              {user?.role === "admin" && (
                <th className="px-4 py-2">Customer</th>
              )}
              <th className="px-4 py-2">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr key={tx.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-mono">{tx.type}</td>
                <td className="px-4 py-2 capitalize">{tx.direction}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={tx.status} />
                </td>
                <td className="px-4 py-2 font-mono text-xs">
                  {tx.orderNumber ?? "N/A"}
                </td>
                {user?.role === "admin" && (
                  <td className="px-4 py-2">{tx.companyName ?? "N/A"}</td>
                )}
                <td className="px-4 py-2 text-muted">
                  {new Date(tx.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {transactions.length === 0 && (
              <tr>
                <td
                  colSpan={user?.role === "admin" ? 6 : 5}
                  className="px-4 py-6 text-center text-muted"
                >
                  No EDI transactions found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
