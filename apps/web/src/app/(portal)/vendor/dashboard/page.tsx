"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useChat } from "@/lib/chat-context";
import { StatusBadge } from "@/components/status-badge";
import { ThinkingIndicator } from "@/components/thinking-indicator";
import {
  Sparkles,
  Package,
  Truck,
  FileText,
  AlertTriangle,
} from "lucide-react";

interface VendorProfile {
  vendorCode: string;
  categoryFocus: string;
  paymentTerms: string;
  leadTimeDays: number;
  reliabilityScore: number;
  preferredShippingMethod: string | null;
  operationsEmail: string | null;
}

interface PurchaseOrder {
  id: number;
  purchaseOrderNumber: string;
  status: string;
  expectedShipDate: string | null;
  total: number;
  updatedAt: string;
}

interface VendorInvoice {
  id: number;
  invoiceNumber: string;
  amount: number;
  status: string;
  dueDate: string;
}

interface VendorCatalogItem {
  id: number;
  vendorSku: string;
  productName: string | null;
  unitCost: number;
  availableQty: number;
  status: string;
  leadTimeDays: number;
}

interface Shipment {
  id: number;
  trackingNumber: string;
  status: string;
  estimatedDelivery: string | null;
}

interface VendorDashboardData {
  companyName: string;
  accountNumber: string;
  vendorProfile: VendorProfile;
  metrics: {
    openPurchaseOrders: number;
    inTransitShipments: number;
    pendingInvoices: number;
    constrainedCatalogItems: number;
    catalogValue: number;
  };
  purchaseOrders: PurchaseOrder[];
  invoices: VendorInvoice[];
  shipments: Shipment[];
  catalogItems: VendorCatalogItem[];
}

export default function VendorDashboardPage() {
  const { token, user } = useAuth();
  const { openChat } = useChat();
  const [data, setData] = useState<VendorDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || user?.role !== "vendor") return;

    api<{ data: VendorDashboardData }>("/api/vendors/dashboard", { token })
      .then((res) => setData(res.data))
      .finally(() => setLoading(false));
  }, [token, user?.role]);

  const highlightedConstraints = useMemo(
    () =>
      data?.catalogItems
        .filter((item) => item.status === "constrained")
        .slice(0, 4) ?? [],
    [data],
  );

  if (user?.role && user.role !== "vendor") {
    return <p className="text-sm text-muted">Vendor access required.</p>;
  }

  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <ThinkingIndicator size="md" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-muted">Vendor data is unavailable.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Vendor Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted">
            {data.companyName} · {data.accountNumber} ·{" "}
            {data.vendorProfile.vendorCode}
          </p>
          <p className="mt-2 text-sm text-muted">
            {data.vendorProfile.categoryFocus} ·{" "}
            {data.vendorProfile.paymentTerms} ·{" "}
            {data.vendorProfile.leadTimeDays} day lead time
          </p>
        </div>
        <div className="rounded border border-border bg-surface px-4 py-3 text-sm text-muted">
          <p className="font-medium text-foreground">Reliability Score</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {data.vendorProfile.reliabilityScore}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Open Purchase Orders"
          value={data.metrics.openPurchaseOrders}
          icon={Package}
        />
        <MetricCard
          label="In Transit Shipments"
          value={data.metrics.inTransitShipments}
          icon={Truck}
        />
        <MetricCard
          label="Pending Invoices"
          value={data.metrics.pendingInvoices}
          icon={FileText}
        />
        <MetricCard
          label="Catalog Constraints"
          value={data.metrics.constrainedCatalogItems}
          icon={AlertTriangle}
        />
      </div>

      <div className="rounded border border-ai/20 bg-ai-light/20 p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-ai" />
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-ai-foreground">
              AI Recommended Follow-up
            </p>
            <p className="mt-2 text-sm text-foreground">
              {data.metrics.constrainedCatalogItems > 0
                ? "Constrained catalog items are your main operational risk today. Review lead times and create a supplier brief before the next buyer call."
                : "Catalog availability is stable. Focus on open purchase orders and invoice resolution next."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  openChat("Summarize open purchase orders and shipments")
                }
                className="rounded border border-ai/30 px-3 py-2 text-xs text-ai-foreground hover:bg-ai-light/50"
              >
                Summarize open POs
              </button>
              <button
                type="button"
                onClick={() =>
                  openChat(
                    "Review constrained catalog and summarize next actions",
                  )
                }
                className="rounded border border-ai/30 px-3 py-2 text-xs text-ai-foreground hover:bg-ai-light/50"
              >
                Review constraints
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <section className="rounded border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              Recent Purchase Orders
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2">PO #</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Expected Ship</th>
                <th className="px-4 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.purchaseOrders.map((order) => (
                <tr
                  key={order.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-2 font-mono text-xs text-foreground">
                    {order.purchaseOrderNumber}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-2 text-muted">
                    {order.expectedShipDate
                      ? new Date(order.expectedShipDate).toLocaleDateString()
                      : "TBD"}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    $
                    {order.total.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="space-y-4">
          <div className="rounded border border-border bg-surface">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">
                Invoices Requiring Attention
              </h2>
            </div>
            <div className="space-y-3 px-4 py-4">
              {data.invoices.slice(0, 4).map((invoice) => (
                <div
                  key={invoice.id}
                  className="rounded border border-border bg-background px-3 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs text-foreground">
                      {invoice.invoiceNumber}
                    </span>
                    <StatusBadge status={invoice.status} />
                  </div>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    $
                    {invoice.amount.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Due {new Date(invoice.dueDate).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded border border-border bg-surface">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">
                Constrained Catalog Items
              </h2>
            </div>
            <div className="space-y-3 px-4 py-4">
              {highlightedConstraints.length ? (
                highlightedConstraints.map((item) => (
                  <div
                    key={item.id}
                    className="rounded border border-border bg-background px-3 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-foreground">
                        {item.productName ?? item.vendorSku}
                      </span>
                      <StatusBadge status={item.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {item.vendorSku} · {item.availableQty} units ·{" "}
                      {item.leadTimeDays} day lead time
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted">
                  No constrained catalog items.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Package;
}) {
  return (
    <div className="rounded border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
        <Icon className="h-4 w-4 text-muted" />
      </div>
      <p className="mt-3 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}
