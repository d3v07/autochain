"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/status-badge";
import { ThinkingIndicator } from "@/components/thinking-indicator";

interface AdminMetrics {
  totalRevenue: number;
  orderCount: number;
  activeCustomers: number;
  outstandingBalance: number;
  activeSessions: number;
  atRiskCustomers: number;
}

interface AdminOrder {
  id: number;
  orderNumber: string;
  status: string;
  total: number;
  createdAt: string;
  customerId: number | null;
  companyName: string | null;
}

export default function AdminDashboardPage() {
  const { token, user } = useAuth();
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [recentOrders, setRecentOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || user?.role !== "admin") return;

    api<{ data: { metrics: AdminMetrics; recentOrders: AdminOrder[] } }>(
      "/api/admin/dashboard",
      { token },
    )
      .then((res) => {
        setMetrics(res.data.metrics);
        setRecentOrders(res.data.recentOrders);
      })
      .finally(() => setLoading(false));
  }, [token, user?.role]);

  if (user?.role !== "admin") {
    return <p className="text-sm text-danger">Admin access required.</p>;
  }

  if (loading || !metrics) {
    return <ThinkingIndicator size="md" />;
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-foreground">Admin Dashboard</h1>
      <p className="mt-1 text-sm text-muted">
        Cross-customer operational metrics
      </p>

      <div className="mt-6 grid grid-cols-3 gap-4 xl:grid-cols-6">
        <div className="rounded border border-border bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Revenue</p>
          <p className="mt-1 text-2xl font-bold font-mono">
            $
            {metrics.totalRevenue.toLocaleString("en-US", {
              minimumFractionDigits: 2,
            })}
          </p>
        </div>
        <div className="rounded border border-border bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Orders</p>
          <p className="mt-1 text-2xl font-bold">{metrics.orderCount}</p>
        </div>
        <div className="rounded border border-border bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-muted">
            Active Customers
          </p>
          <p className="mt-1 text-2xl font-bold">{metrics.activeCustomers}</p>
        </div>
        <div className="rounded border border-border bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-muted">
            Outstanding
          </p>
          <p className="mt-1 text-2xl font-bold font-mono">
            $
            {metrics.outstandingBalance.toLocaleString("en-US", {
              minimumFractionDigits: 2,
            })}
          </p>
        </div>
        <div className="rounded border border-border bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-muted">
            Active Sessions
          </p>
          <p className="mt-1 text-2xl font-bold">{metrics.activeSessions}</p>
        </div>
        <div className="rounded border border-border bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-muted">At Risk</p>
          <p className="mt-1 text-2xl font-bold text-danger">
            {metrics.atRiskCustomers}
          </p>
        </div>
      </div>

      <div className="mt-8 rounded border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Recent Orders
          </h2>
          <Link
            href="/admin/orders"
            className="text-xs font-medium text-accent hover:underline"
          >
            View all
          </Link>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2">Order #</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Total</th>
              <th className="px-4 py-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {recentOrders.map((order) => (
              <tr
                key={order.id}
                className="border-b border-border last:border-0"
              >
                <td className="px-4 py-2 font-mono text-xs">
                  {order.orderNumber}
                </td>
                <td className="px-4 py-2">{order.companyName ?? "Unknown"}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={order.status} />
                </td>
                <td className="px-4 py-2 text-right font-mono">
                  $
                  {order.total.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}
                </td>
                <td className="px-4 py-2 text-muted">
                  {new Date(order.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
