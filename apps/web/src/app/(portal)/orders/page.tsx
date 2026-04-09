"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/status-badge";
import { ThinkingIndicator } from "@/components/thinking-indicator";
import { Sparkles, ChevronDown, ChevronUp } from "lucide-react";

interface Order {
  id: number;
  orderNumber: string;
  status: string;
  total: number;
  createdAt: string;
}

export default function OrdersPage() {
  const { token } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaryOpen, setSummaryOpen] = useState(true);

  useEffect(() => {
    if (!token) return;
    api<{ data: Order[] }>("/api/orders", { token })
      .then((res) => setOrders(res.data))
      .finally(() => setLoading(false));
  }, [token]);

  const pendingShipment = orders.filter(
    (o) => o.status === "confirmed" || o.status === "processing",
  );
  const monthTotal = orders.reduce((sum, o) => sum + o.total, 0);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Orders</h1>
        <Link
          href="/products"
          data-agent-id="orders-new-order"
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          New Order
        </Link>
      </div>

      {/* AI Order Summary */}
      {!loading && orders.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setSummaryOpen(!summaryOpen)}
            className="flex items-center gap-2 text-xs text-ai-foreground hover:text-ai"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="font-semibold uppercase tracking-wide">
              AI Summary
            </span>
            {summaryOpen ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
          {summaryOpen && (
            <div className="mt-2 rounded border-l-2 border-ai bg-ai-light/20 px-4 py-3">
              <p className="text-sm text-foreground">
                {orders.length} orders totaling $
                {monthTotal.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                })}
                {pendingShipment.length > 0 &&
                  ` — ${pendingShipment.length} pending shipment`}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 rounded border border-border bg-surface">
        {loading ? (
          <div className="px-4 py-6">
            <ThinkingIndicator className="justify-center" />
          </div>
        ) : (
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
              {orders.map((order) => (
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
              {orders.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted">
                    No orders yet
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
