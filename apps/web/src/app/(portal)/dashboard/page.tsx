"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useChat } from "@/lib/chat-context";
import { StatusBadge } from "@/components/status-badge";
import { ThinkingIndicator } from "@/components/thinking-indicator";
import { Sparkles, X, MessageSquare, RefreshCw, Calendar } from "lucide-react";

interface Order {
  id: number;
  orderNumber: string;
  status: string;
  total: number;
  createdAt: string;
}

interface Invoice {
  id: number;
  invoiceNumber: string;
  amount: number;
  status: string;
  dueDate: string;
}

export default function DashboardPage() {
  const { user, token } = useAuth();
  const { openChat } = useChat();
  const [orders, setOrders] = useState<Order[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissedInsights, setDismissedInsights] = useState<Set<number>>(
    () => new Set(),
  );

  useEffect(() => {
    if (!token) return;

    Promise.all([
      api<{ data: Order[] }>("/api/orders", { token }),
      api<{ data: Invoice[] }>("/api/invoices", { token }),
    ])
      .then(([ordersRes, invoicesRes]) => {
        setOrders(ordersRes.data);
        setInvoices(invoicesRes.data);
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <ThinkingIndicator size="md" />
      </div>
    );
  }

  const openInvoices = invoices.filter((i) => i.status !== "paid");
  const overdueInvoices = invoices.filter((i) => i.status === "overdue");
  const totalOwed = openInvoices.reduce((sum, i) => sum + i.amount, 0);
  const recentOrders = orders.slice(0, 5);
  const pendingShipment = orders.filter(
    (o) => o.status === "confirmed" || o.status === "processing",
  );

  const insights = [
    overdueInvoices.length > 0
      ? `${overdueInvoices.length} invoice${overdueInvoices.length > 1 ? "s" : ""} totaling $${overdueInvoices.reduce((s, i) => s + i.amount, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} are overdue`
      : null,
    pendingShipment.length > 0
      ? `${pendingShipment.length} order${pendingShipment.length > 1 ? "s" : ""} pending shipment`
      : null,
    orders.length > 5
      ? `You've placed ${orders.length} orders — ask me for trends and analysis`
      : null,
  ].filter((i): i is string => i !== null && !dismissedInsights.has(0));

  return (
    <div>
      <h1 className="text-xl font-bold text-foreground">
        Welcome, {user?.companyName}
      </h1>
      <p className="mt-1 text-sm text-muted">Account #{user?.customerId}</p>

      {/* AI Insights Banner */}
      {insights.length > 0 && (
        <div className="mt-4 rounded border-l-2 border-ai bg-ai-light/30 p-4">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-ai" />
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-ai-foreground">
                AI Insights
              </p>
              <ul className="mt-2 space-y-1">
                {insights.map((insight, i) => (
                  <li
                    key={i}
                    className="flex items-start justify-between text-sm text-foreground"
                  >
                    <span>• {insight}</span>
                    <button
                      onClick={() =>
                        setDismissedInsights((prev) => new Set([...prev, i]))
                      }
                      className="ml-2 shrink-0 text-muted hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
              <Link
                href="/insights"
                className="mt-2 inline-block text-xs font-medium text-ai-foreground hover:text-ai"
              >
                View all insights →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="rounded border border-border bg-surface p-4">
          <p className="text-xs text-muted uppercase tracking-wide">
            Total Orders
          </p>
          <p className="mt-1 text-2xl font-bold">{orders.length}</p>
        </div>
        <div className="rounded border border-border bg-surface p-4">
          <p className="text-xs text-muted uppercase tracking-wide">
            Open Invoices
          </p>
          <p className="mt-1 text-2xl font-bold">{openInvoices.length}</p>
        </div>
        <div className="rounded border border-border bg-surface p-4">
          <p className="text-xs text-muted uppercase tracking-wide">
            Outstanding Balance
          </p>
          <p className="mt-1 text-2xl font-bold font-mono">
            ${totalOwed.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-6 flex gap-3">
        <Link
          href="/products"
          data-agent-id="dashboard-new-order"
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          New Order
        </Link>
        <Link
          href="/orders"
          data-agent-id="dashboard-view-orders"
          className="rounded border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-background"
        >
          View All Orders
        </Link>
      </div>

      {/* Recent Orders */}
      <div className="mt-8">
        <h2 className="text-xs font-semibold text-muted uppercase tracking-wide">
          Recent Orders
        </h2>
        <div className="mt-3 rounded border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted uppercase tracking-wide">
                <th className="px-4 py-2">Order #</th>
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
                  <td className="px-4 py-2">
                    <Link
                      href={`/orders/${order.id}`}
                      className="text-accent hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
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
              {recentOrders.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted">
                    No orders yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI Quick Actions */}
      <div className="mt-8">
        <h2 className="text-xs font-semibold text-muted uppercase tracking-wide">
          AI Quick Actions
        </h2>
        <div className="mt-3 flex gap-3">
          <button
            onClick={() => openChat("Tell me about my recent orders")}
            data-agent-id="dashboard-ai-order"
            className="flex items-center gap-2 rounded border border-ai/30 px-3 py-2 text-sm text-ai-foreground hover:bg-ai-light/50 transition-colors"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Ask about an order
          </button>
          <button
            onClick={() =>
              openChat("Based on my order history, what should I reorder?")
            }
            data-agent-id="dashboard-ai-reorder"
            className="flex items-center gap-2 rounded border border-ai/30 px-3 py-2 text-sm text-ai-foreground hover:bg-ai-light/50 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Get reorder suggestions
          </button>
          <button
            onClick={() => openChat("Summarize my activity this month")}
            data-agent-id="dashboard-ai-monthly-summary"
            className="flex items-center gap-2 rounded border border-ai/30 px-3 py-2 text-sm text-ai-foreground hover:bg-ai-light/50 transition-colors"
          >
            <Calendar className="h-3.5 w-3.5" />
            Summarize this month
          </button>
        </div>
      </div>
    </div>
  );
}
