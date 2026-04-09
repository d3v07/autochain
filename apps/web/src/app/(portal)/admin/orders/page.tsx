"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/status-badge";
import { ThinkingIndicator } from "@/components/thinking-indicator";

interface AdminOrder {
  id: number;
  orderNumber: string;
  status: string;
  total: number;
  createdAt: string;
  customerId: number | null;
  companyName: string | null;
}

interface CustomerOption {
  id: number;
  companyName: string;
}

const ORDER_STATUSES = [
  "all",
  "draft",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
] as const;

export default function AdminOrdersPage() {
  const { token, user } = useAuth();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || user?.role !== "admin") return;

    api<{ data: { id: number; companyName: string }[] }>(
      "/api/admin/customers?limit=200",
      { token },
    ).then((res) => setCustomers(res.data));
  }, [token, user?.role]);

  useEffect(() => {
    if (!token || user?.role !== "admin") return;

    const params = new URLSearchParams({ limit: "500" });
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (customerFilter !== "all") params.set("customerId", customerFilter);

    setLoading(true);
    api<{ data: AdminOrder[] }>(`/api/admin/orders?${params.toString()}`, {
      token,
    })
      .then((res) => setOrders(res.data))
      .finally(() => setLoading(false));
  }, [token, user?.role, statusFilter, customerFilter]);

  if (user?.role !== "admin") {
    return <p className="text-sm text-danger">Admin access required.</p>;
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-foreground">All Orders</h1>
      <p className="mt-1 text-sm text-muted">
        Filterable order list across all customers
      </p>

      <div className="mt-4 flex gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded border border-border bg-surface px-3 py-1.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
        >
          {ORDER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status === "all"
                ? "All statuses"
                : status.charAt(0).toUpperCase() + status.slice(1)}
            </option>
          ))}
        </select>

        <select
          value={customerFilter}
          onChange={(e) => setCustomerFilter(e.target.value)}
          className="rounded border border-border bg-surface px-3 py-1.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
        >
          <option value="all">All customers</option>
          {customers.map((customer) => (
            <option key={customer.id} value={String(customer.id)}>
              {customer.companyName}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 rounded border border-border bg-surface">
        {loading ? (
          <div className="px-4 py-6">
            <ThinkingIndicator className="justify-center" />
          </div>
        ) : (
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
              {orders.map((order) => (
                <tr
                  key={order.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-2 font-mono text-xs">
                    {order.orderNumber}
                  </td>
                  <td className="px-4 py-2">
                    {order.companyName ?? "Unknown"}
                  </td>
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
              {orders.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted">
                    No orders found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
