"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useChat } from "@/lib/chat-context";
import { StatusBadge } from "@/components/status-badge";
import { ThinkingIndicator } from "@/components/thinking-indicator";
import { MessageSquare, ShoppingCart, ArrowLeft, Truck } from "lucide-react";

interface OrderLine {
  id: number;
  productId: number;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  productName: string;
  productSku: string;
}

interface OrderDetail {
  id: number;
  orderNumber: string;
  status: string;
  total: number;
  createdAt: string;
  updatedAt: string;
  lines: OrderLine[];
}

interface ShipmentEvent {
  status: string;
  description: string;
  location?: string;
  timestamp: string;
}

interface Shipment {
  id: number;
  orderId: number;
  carrier: string;
  trackingNumber: string;
  status: string;
  estimatedDelivery: string | null;
  events: ShipmentEvent[];
  createdAt: string;
}

const STATUS_STEPS = [
  "draft",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
];

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { token } = useAuth();
  const { openChat } = useChat();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [shipmentLoading, setShipmentLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || !params.id) return;
    api<{ data: OrderDetail }>(`/api/orders/${params.id}`, { token })
      .then((res) => setOrder(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token, params.id]);

  useEffect(() => {
    if (!token || !params.id) return;
    api<{ data: Shipment }>(`/api/shipments/${params.id}`, { token })
      .then((res) => setShipment(res.data))
      .catch(() => setShipment(null))
      .finally(() => setShipmentLoading(false));
  }, [token, params.id]);

  function reorder() {
    if (!order) return;
    const cartItems = order.lines.map((line) => ({
      product: {
        id: line.productId,
        sku: line.productSku,
        name: line.productName,
        description: "",
        category: "",
        unitPrice: line.unitPrice,
        quantityAvailable: null,
        quantityReserved: null,
      },
      quantity: line.quantity,
    }));
    localStorage.setItem("evo_cart", JSON.stringify(cartItems));
    router.push("/products");
  }

  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <ThinkingIndicator size="md" />
      </div>
    );
  }
  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!order) return <p className="text-sm text-muted">Order not found</p>;

  const currentStep = STATUS_STEPS.indexOf(order.status);
  const isCancelled = order.status === "cancelled";

  return (
    <div>
      <div className="flex items-center gap-3">
        <Link
          href="/orders"
          className="text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-bold text-foreground">
          {order.orderNumber}
        </h1>
        <StatusBadge status={order.status} />
      </div>

      {/* Status Timeline */}
      {!isCancelled && (
        <div className="mt-6 flex items-center gap-1">
          {STATUS_STEPS.map((step, i) => {
            const reached = i <= currentStep;
            return (
              <div key={step} className="flex items-center gap-1">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                    reached ? "bg-accent text-white" : "bg-gray-200 text-muted"
                  }`}
                >
                  {i + 1}
                </div>
                <span
                  className={`text-xs capitalize ${reached ? "text-foreground font-medium" : "text-muted"}`}
                >
                  {step}
                </span>
                {i < STATUS_STEPS.length - 1 && (
                  <div
                    className={`mx-1 h-px w-8 ${reached ? "bg-accent" : "bg-gray-200"}`}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Order Info */}
      <div className="mt-6 grid grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-xs text-muted uppercase tracking-wide">
            Order Date
          </p>
          <p className="mt-1 font-medium">
            {new Date(order.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted uppercase tracking-wide">
            Last Updated
          </p>
          <p className="mt-1 font-medium">
            {new Date(order.updatedAt).toLocaleDateString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted uppercase tracking-wide">Total</p>
          <p className="mt-1 font-medium font-mono">
            ${order.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Line Items */}
      <div className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Line Items
        </h2>
        <div className="mt-2 rounded border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted uppercase tracking-wide">
                <th className="px-4 py-2">SKU</th>
                <th className="px-4 py-2">Product</th>
                <th className="px-4 py-2 text-right">Qty</th>
                <th className="px-4 py-2 text-right">Unit Price</th>
                <th className="px-4 py-2 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line) => (
                <tr
                  key={line.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-2 font-mono text-xs text-muted">
                    {line.productSku}
                  </td>
                  <td className="px-4 py-2">{line.productName}</td>
                  <td className="px-4 py-2 text-right">{line.quantity}</td>
                  <td className="px-4 py-2 text-right font-mono">
                    ${line.unitPrice.toFixed(2)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    $
                    {line.lineTotal.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-semibold">
                <td colSpan={4} className="px-4 py-2 text-right">
                  Total
                </td>
                <td className="px-4 py-2 text-right font-mono">
                  $
                  {order.total.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Shipment Tracking */}
      <div className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Shipment Tracking
        </h2>
        <div className="mt-2 rounded border border-border bg-surface p-4">
          {shipmentLoading ? (
            <ThinkingIndicator />
          ) : shipment ? (
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {shipment.carrier}
                  </p>
                  <p className="text-xs font-mono text-muted">
                    Tracking: {shipment.trackingNumber}
                  </p>
                </div>
                <div className="text-right">
                  <StatusBadge status={shipment.status} />
                  <p className="mt-1 text-xs text-muted">
                    ETA:{" "}
                    {shipment.estimatedDelivery
                      ? new Date(
                          shipment.estimatedDelivery,
                        ).toLocaleDateString()
                      : "TBD"}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {shipment.events.map((event, index) => (
                  <div key={`${event.status}-${index}`} className="flex gap-3">
                    <Truck className="mt-0.5 h-4 w-4 text-accent" />
                    <div>
                      <p className="text-sm text-foreground">
                        {event.description}
                      </p>
                      <p className="text-xs text-muted">
                        {event.location ? `${event.location} · ` : ""}
                        {new Date(event.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">
              Shipment data will appear once this order is marked as shipped.
            </p>
          )}
        </div>
      </div>

      {/* AI Actions */}
      <div className="mt-6 flex gap-3">
        <button
          onClick={() =>
            openChat(
              `Tell me about order ${order.orderNumber} — status: ${order.status}, total: $${order.total}, ${order.lines.length} items`,
            )
          }
          className="flex items-center gap-2 rounded border border-ai/30 px-3 py-2 text-sm text-ai-foreground hover:bg-ai-light/50 transition-colors"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Ask about this order
        </button>
        <button
          onClick={reorder}
          className="flex items-center gap-2 rounded border border-border px-3 py-2 text-sm text-foreground hover:bg-background transition-colors"
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          Reorder these items
        </button>
      </div>
    </div>
  );
}
