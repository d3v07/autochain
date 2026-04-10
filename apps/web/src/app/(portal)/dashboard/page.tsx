"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Calendar,
  MessageSquare,
  Package,
  PieChart,
  RefreshCw,
  Sparkles,
  Truck,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useChat } from "@/lib/chat-context";
import { StatusBadge } from "@/components/status-badge";
import { ThinkingIndicator } from "@/components/thinking-indicator";

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

interface ShipmentEvent {
  status: string;
  description: string;
  location?: string;
  timestamp: string;
}

interface ShipmentSummary {
  id: number;
  orderId: number;
  orderNumber: string;
  orderStatus: string;
  carrier: string;
  trackingNumber: string;
  status: string;
  estimatedDelivery: string | null;
  createdAt: string;
  events: ShipmentEvent[];
}

interface VisualizationPoint {
  label: string;
  value: number;
  detail?: string;
  color?: string;
}

interface VisualizationData {
  prompt: string;
  title: string;
  chartType: "histogram" | "pie";
  description: string;
  unit: "currency" | "count" | "percent";
  series: VisualizationPoint[];
}

const VISUAL_PROMPTS = [
  "Compare savings for last few months",
  "Show distribution of our business through different vendors",
  "Show delivery status across current freight lanes",
];

const CHART_COLORS = [
  "#0f5132",
  "#2f855a",
  "#0ea5e9",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
];

export default function DashboardPage() {
  const { user, token } = useAuth();
  const { openChat } = useChat();
  const [orders, setOrders] = useState<Order[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [shipments, setShipments] = useState<ShipmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissedInsights, setDismissedInsights] = useState<Set<number>>(
    () => new Set(),
  );
  const [visualPrompt, setVisualPrompt] = useState(VISUAL_PROMPTS[0]!);
  const [visualization, setVisualization] = useState<VisualizationData | null>(
    null,
  );
  const [visualizing, setVisualizing] = useState(false);
  const [visualError, setVisualError] = useState("");

  useEffect(() => {
    if (!token) return;

    Promise.all([
      api<{ data: Order[] }>("/api/orders", { token }),
      api<{ data: Invoice[] }>("/api/invoices", { token }),
      api<{ data: ShipmentSummary[] }>("/api/shipments?limit=4", { token }),
    ])
      .then(([ordersRes, invoicesRes, shipmentsRes]) => {
        setOrders(ordersRes.data);
        setInvoices(invoicesRes.data);
        setShipments(shipmentsRes.data);
      })
      .finally(() => setLoading(false));

    void requestVisualization(VISUAL_PROMPTS[0]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function requestVisualization(promptText: string) {
    if (!token) return;

    setVisualizing(true);
    setVisualError("");
    try {
      const res = await api<{ data: VisualizationData }>(
        "/api/insights/visualization",
        {
          method: "POST",
          token,
          body: { prompt: promptText },
        },
      );
      setVisualization(res.data);
      setVisualPrompt(promptText);
    } catch (err) {
      setVisualError(
        err instanceof Error ? err.message : "Failed to load visualization",
      );
    } finally {
      setVisualizing(false);
    }
  }

  async function handleVisualizationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await requestVisualization(visualPrompt);
  }

  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <ThinkingIndicator size="md" />
      </div>
    );
  }

  const openInvoices = invoices.filter((invoice) => invoice.status !== "paid");
  const overdueInvoices = invoices.filter(
    (invoice) => invoice.status === "overdue",
  );
  const totalOwed = openInvoices.reduce(
    (sum, invoice) => sum + invoice.amount,
    0,
  );
  const recentOrders = orders.slice(0, 5);
  const pendingShipment = orders.filter((order) =>
    ["confirmed", "processing"].includes(order.status),
  );
  const activeShipments = shipments.filter((shipment) =>
    ["pending", "in_transit", "delayed"].includes(shipment.status),
  );
  const deliveredShipments = shipments.filter(
    (shipment) => shipment.status === "delivered",
  );

  const insights = [
    overdueInvoices.length > 0
      ? `${overdueInvoices.length} invoice${overdueInvoices.length > 1 ? "s" : ""} totaling ${formatCurrency(overdueInvoices.reduce((sum, invoice) => sum + invoice.amount, 0))} are overdue`
      : null,
    pendingShipment.length > 0
      ? `${pendingShipment.length} order${pendingShipment.length > 1 ? "s" : ""} pending shipment handoff`
      : null,
    activeShipments.length > 0
      ? `${activeShipments.length} freight lane${activeShipments.length > 1 ? "s are" : " is"} active in the delivery tracker`
      : null,
    orders.length > 5
      ? `You've placed ${orders.length} orders. Use the visual studio below to compare savings and sourcing mix.`
      : null,
  ].filter(
    (insight, index): insight is string =>
      insight !== null && !dismissedInsights.has(index),
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Welcome, {user?.companyName}
          </h1>
          <p className="mt-1 text-sm text-muted">Account #{user?.customerId}</p>
        </div>
        <div className="rounded-2xl border border-ai/20 bg-[linear-gradient(135deg,rgba(15,81,50,0.12),rgba(14,165,233,0.08))] px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ai-foreground">
            <Truck className="h-3.5 w-3.5" />
            Freight Focus
          </div>
          <p className="mt-2 text-sm text-foreground">
            {activeShipments.length > 0
              ? `${activeShipments.length} shipment${activeShipments.length > 1 ? "s" : ""} moving right now.`
              : "No active freight lanes at the moment."}
          </p>
        </div>
      </div>

      {insights.length > 0 && (
        <div className="rounded-2xl border border-ai/20 bg-ai-light/25 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-ai" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-ai-foreground">
                AI Insights
              </p>
              <ul className="mt-2 space-y-1.5">
                {insights.map((insight, index) => (
                  <li
                    key={`${insight}-${index}`}
                    className="flex items-start justify-between gap-3 text-sm text-foreground"
                  >
                    <span>• {insight}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setDismissedInsights((prev) => {
                          const next = new Set(prev);
                          next.add(index);
                          return next;
                        })
                      }
                      className="shrink-0 text-muted hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
              <Link
                href="/insights"
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-ai-foreground hover:text-ai"
              >
                View all insights
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardMetricCard
          label="Total Orders"
          value={String(orders.length)}
          caption="Placed on the account"
          icon={Package}
        />
        <DashboardMetricCard
          label="Open Invoices"
          value={String(openInvoices.length)}
          caption={`${overdueInvoices.length} overdue`}
          icon={Calendar}
        />
        <DashboardMetricCard
          label="Outstanding Balance"
          value={formatCurrency(totalOwed)}
          caption="Across pending and overdue"
          icon={RefreshCw}
          mono
        />
        <DashboardMetricCard
          label="Tracked Deliveries"
          value={String(activeShipments.length)}
          caption={`${deliveredShipments.length} delivered recently`}
          icon={Truck}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-border bg-surface shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Recent Orders
              </h2>
              <p className="mt-1 text-xs text-muted">
                Track order status, then jump directly into the delivery view.
              </p>
            </div>
            <Link
              href="/orders"
              data-agent-id="dashboard-view-orders"
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-background"
            >
              View All Orders
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3">Order #</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Total</th>
                  <th className="px-5 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/orders/${order.id}`}
                        className="font-medium text-accent hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-5 py-3 text-right font-mono">
                      {formatCurrency(order.total)}
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {recentOrders.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-5 py-8 text-center text-muted"
                    >
                      No orders yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-3 px-5 py-4">
            <Link
              href="/products"
              data-agent-id="dashboard-new-order"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
            >
              New Order
            </Link>
            <button
              type="button"
              onClick={() => openChat("Tell me about my recent orders")}
              data-agent-id="dashboard-ai-order"
              className="rounded-lg border border-ai/30 px-4 py-2 text-sm font-medium text-ai-foreground hover:bg-ai-light/50"
            >
              Ask about an order
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-surface shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Delivery Tracker
              </h2>
              <p className="mt-1 text-xs text-muted">
                Freight status, ETA, and tracking numbers in one place.
              </p>
            </div>
            <Truck className="h-4 w-4 text-accent" />
          </div>
          <div className="space-y-3 px-5 py-4">
            {shipments.map((shipment) => (
              <Link
                key={shipment.id}
                href={`/orders/${shipment.orderId}`}
                className="block rounded-2xl border border-border bg-background px-4 py-4 transition-colors hover:border-accent/40 hover:bg-surface"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-light/30 text-accent">
                      <Truck className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {shipment.orderNumber}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {shipment.carrier} · {shipment.trackingNumber}
                      </p>
                      <p className="mt-2 text-xs text-muted">
                        {shipment.estimatedDelivery
                          ? `ETA ${new Date(shipment.estimatedDelivery).toLocaleDateString()}`
                          : "ETA pending"}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={shipment.status} />
                </div>
                {shipment.events[shipment.events.length - 1] && (
                  <p className="mt-3 text-xs text-muted">
                    {shipment.events[shipment.events.length - 1]!.description}
                  </p>
                )}
              </Link>
            ))}
            {shipments.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
                Delivery tracking appears here once an order ships.
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ai-foreground">
                <BarChart3 className="h-3.5 w-3.5" />
                Visual Insights Studio
              </div>
              <h2 className="mt-2 text-lg font-semibold text-foreground">
                Ask for a chart in plain language
              </h2>
              <p className="mt-1 text-sm text-muted">
                Compare savings, view supplier mix, or visualize freight
                activity without leaving the customer dashboard.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                openChat(
                  "Use a visual explanation to compare savings and vendor mix for the last few months.",
                  { shellMode: "workspace" },
                )
              }
              className="rounded-lg border border-ai/30 px-3 py-2 text-sm font-medium text-ai-foreground hover:bg-ai-light/50"
            >
              Open Assistant Workspace
            </button>
          </div>
        </div>

        <div className="grid gap-6 px-5 py-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-4">
            <form onSubmit={handleVisualizationSubmit} className="space-y-3">
              <label className="block text-sm text-foreground">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Prompt
                </span>
                <textarea
                  rows={4}
                  value={visualPrompt}
                  onChange={(event) => setVisualPrompt(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-border bg-background px-3 py-3 text-sm focus:border-ai focus:ring-1 focus:ring-ai focus:outline-none"
                  placeholder="Compare savings for last few months"
                />
              </label>
              <button
                type="submit"
                disabled={visualizing || !visualPrompt.trim()}
                className="w-full rounded-lg bg-ai px-4 py-2.5 text-sm font-medium text-white hover:bg-ai-hover disabled:opacity-50"
              >
                {visualizing ? "Rendering chart..." : "Generate visualization"}
              </button>
            </form>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Suggested Prompts
              </p>
              {VISUAL_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void requestVisualization(prompt)}
                  className="block w-full rounded-xl border border-ai/20 bg-ai-light/20 px-3 py-2 text-left text-xs text-ai-foreground hover:bg-ai-light/40"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="rounded-2xl border border-border bg-background px-4 py-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                <PieChart className="h-3.5 w-3.5" />
                What It Can Show
              </div>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                <li>• Contract savings over time</li>
                <li>• Business share by vendor or supplier</li>
                <li>• Delivery and freight status mix</li>
              </ul>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-background p-5">
            {visualizing && (
              <div className="flex min-h-[320px] items-center justify-center">
                <ThinkingIndicator size="md" />
              </div>
            )}

            {!visualizing && visualError && (
              <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
                {visualError}
              </div>
            )}

            {!visualizing && !visualError && visualization && (
              <VisualizationCard visualization={visualization} />
            )}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() =>
            openChat("Based on my order history, what should I reorder?")
          }
          data-agent-id="dashboard-ai-reorder"
          className="flex items-center gap-2 rounded-lg border border-ai/30 px-3 py-2 text-sm text-ai-foreground hover:bg-ai-light/50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Get reorder suggestions
        </button>
        <button
          type="button"
          onClick={() => openChat("Summarize my activity this month")}
          data-agent-id="dashboard-ai-monthly-summary"
          className="flex items-center gap-2 rounded-lg border border-ai/30 px-3 py-2 text-sm text-ai-foreground hover:bg-ai-light/50"
        >
          <Calendar className="h-3.5 w-3.5" />
          Summarize this month
        </button>
        <button
          type="button"
          onClick={() => openChat("Track my active deliveries and freight ETA")}
          className="flex items-center gap-2 rounded-lg border border-ai/30 px-3 py-2 text-sm text-ai-foreground hover:bg-ai-light/50"
        >
          <Truck className="h-3.5 w-3.5" />
          Track deliveries
        </button>
        <button
          type="button"
          onClick={() => openChat("Compare savings for last few months")}
          className="flex items-center gap-2 rounded-lg border border-ai/30 px-3 py-2 text-sm text-ai-foreground hover:bg-ai-light/50"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Ask for a chart
        </button>
      </div>
    </div>
  );
}

function DashboardMetricCard({
  label,
  value,
  caption,
  icon: Icon,
  mono = false,
}: {
  label: string;
  value: string;
  caption: string;
  icon: typeof Package;
  mono?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
          <p
            className={`mt-2 text-2xl font-semibold text-foreground ${mono ? "font-mono" : ""}`}
          >
            {value}
          </p>
          <p className="mt-2 text-xs text-muted">{caption}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-light/30 text-accent">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function VisualizationCard({
  visualization,
}: {
  visualization: VisualizationData;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Generated from prompt
          </p>
          <h3 className="mt-1 text-lg font-semibold text-foreground">
            {visualization.title}
          </h3>
          <p className="mt-1 text-sm text-muted">{visualization.description}</p>
          <p className="mt-2 text-xs text-muted">“{visualization.prompt}”</p>
        </div>
        <span className="rounded-full border border-border bg-surface px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted">
          {visualization.chartType}
        </span>
      </div>

      {visualization.chartType === "histogram" ? (
        <HistogramChart visualization={visualization} />
      ) : (
        <PieChartVisualization visualization={visualization} />
      )}
    </div>
  );
}

function HistogramChart({
  visualization,
}: {
  visualization: VisualizationData;
}) {
  const maxValue = Math.max(
    ...visualization.series.map((point) => point.value),
    1,
  );

  return (
    <div className="space-y-4">
      <div className="flex min-h-[280px] items-end gap-3 rounded-2xl border border-border bg-surface px-4 pb-4 pt-6">
        {visualization.series.map((point, index) => {
          const height = `${Math.max(14, (point.value / maxValue) * 220)}px`;
          return (
            <div
              key={`${point.label}-${index}`}
              className="flex flex-1 flex-col items-center gap-3"
            >
              <div className="text-center text-[11px] text-muted">
                {formatVisualizationValue(visualization.unit, point.value)}
              </div>
              <div
                className="w-full rounded-t-2xl bg-[linear-gradient(180deg,rgba(15,81,50,0.92),rgba(14,165,233,0.72))] shadow-sm"
                style={{ height }}
              />
              <div className="text-center">
                <p className="text-xs font-medium text-foreground">
                  {point.label}
                </p>
                {point.detail && (
                  <p className="mt-1 text-[11px] text-muted">{point.detail}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PieChartVisualization({
  visualization,
}: {
  visualization: VisualizationData;
}) {
  const total = visualization.series.reduce(
    (sum, point) => sum + point.value,
    0,
  );
  let cumulative = 0;

  const segments = visualization.series.map((point, index) => {
    const fraction = total > 0 ? point.value / total : 0;
    const start = cumulative;
    cumulative += fraction;
    return {
      ...point,
      start,
      end: cumulative,
      color: point.color ?? CHART_COLORS[index % CHART_COLORS.length],
    };
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div className="flex items-center justify-center rounded-2xl border border-border bg-surface p-5">
        <svg viewBox="0 0 200 200" className="h-52 w-52">
          {segments.length === 0 ? (
            <circle cx="100" cy="100" r="72" fill="#e5e7eb" />
          ) : (
            segments.map((segment) => (
              <circle
                key={segment.label}
                cx="100"
                cy="100"
                r="72"
                fill="transparent"
                stroke={segment.color}
                strokeWidth="36"
                strokeDasharray={`${(segment.end - segment.start) * 452.4} 452.4`}
                strokeDashoffset={`${-segment.start * 452.4}`}
                transform="rotate(-90 100 100)"
              />
            ))
          )}
          <circle cx="100" cy="100" r="42" fill="white" />
          <text
            x="100"
            y="94"
            textAnchor="middle"
            className="fill-slate-500 text-[10px] uppercase tracking-wide"
          >
            total
          </text>
          <text
            x="100"
            y="112"
            textAnchor="middle"
            className="fill-slate-900 text-[12px] font-semibold"
          >
            {formatVisualizationValue(visualization.unit, total)}
          </text>
        </svg>
      </div>

      <div className="space-y-3">
        {segments.map((segment) => {
          const share = total > 0 ? (segment.value / total) * 100 : 0;
          return (
            <div
              key={segment.label}
              className="rounded-2xl border border-border bg-surface px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span
                    className="mt-1 h-3 w-3 rounded-full"
                    style={{ backgroundColor: segment.color }}
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {segment.label}
                    </p>
                    {segment.detail && (
                      <p className="mt-1 text-xs text-muted">
                        {segment.detail}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground">
                    {formatVisualizationValue(
                      visualization.unit,
                      segment.value,
                    )}
                  </p>
                  <p className="mt-1 text-xs text-muted">{share.toFixed(1)}%</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function formatVisualizationValue(
  unit: VisualizationData["unit"],
  value: number,
) {
  if (unit === "currency") {
    return formatCurrency(value);
  }

  if (unit === "percent") {
    return `${value.toFixed(1)}%`;
  }

  return `${value}`;
}
