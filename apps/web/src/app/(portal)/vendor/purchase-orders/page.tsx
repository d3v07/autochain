"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, MapPin, Save, Truck, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/status-badge";
import { ThinkingIndicator } from "@/components/thinking-indicator";

interface PurchaseOrderLine {
  productId: number;
  productName: string | null;
  productSku: string | null;
  quantity: number;
  unitCost: number;
  lineTotal: number;
}

interface PurchaseOrder {
  id: number;
  purchaseOrderNumber: string;
  status: string;
  expectedShipDate: string | null;
  total: number;
  createdAt: string;
  updatedAt: string;
  lines: PurchaseOrderLine[];
}

interface ShipmentEvent {
  status: string;
  description: string;
  location?: string;
  timestamp: string;
}

interface VendorShipment {
  id: number;
  purchaseOrderId: number;
  carrier: string;
  trackingNumber: string;
  status: "pending" | "in_transit" | "delivered" | "delayed";
  estimatedDelivery: string | null;
  purchaseOrderStatus?: string;
  events: ShipmentEvent[];
  createdAt: string;
}

interface ShipmentFormState {
  carrier: string;
  trackingNumber: string;
  status: "pending" | "in_transit" | "delivered" | "delayed";
  estimatedDelivery: string;
  note: string;
  location: string;
}

const STATUS_OPTIONS: ShipmentFormState["status"][] = [
  "pending",
  "in_transit",
  "delivered",
  "delayed",
];

export default function VendorPurchaseOrdersPage() {
  const { token, user } = useAuth();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [shipmentsByOrder, setShipmentsByOrder] = useState<
    Record<number, VendorShipment>
  >({});
  const [shipmentForms, setShipmentForms] = useState<
    Record<number, ShipmentFormState>
  >({});
  const [loading, setLoading] = useState(true);
  const [savingOrderId, setSavingOrderId] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || user?.role !== "vendor") return;

    Promise.all([
      api<{ data: PurchaseOrder[] }>("/api/vendors/purchase-orders", { token }),
      api<{ data: VendorShipment[] }>("/api/vendors/shipments", { token }),
    ])
      .then(([ordersRes, shipmentsRes]) => {
        setOrders(ordersRes.data);

        const nextShipments: Record<number, VendorShipment> = {};
        const nextForms: Record<number, ShipmentFormState> = {};

        shipmentsRes.data.forEach((shipment) => {
          nextShipments[shipment.purchaseOrderId] = shipment;
        });

        ordersRes.data.forEach((order) => {
          nextForms[order.id] = createShipmentForm(
            nextShipments[order.id],
            order,
          );
        });

        setShipmentsByOrder(nextShipments);
        setShipmentForms(nextForms);
      })
      .catch((err) =>
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load vendor freight data",
        ),
      )
      .finally(() => setLoading(false));
  }, [token, user?.role]);

  const openOrders = useMemo(
    () =>
      orders.filter((order) =>
        ["sent", "confirmed", "in_production", "shipped"].includes(
          order.status,
        ),
      ),
    [orders],
  );

  const activeShipments = Object.values(shipmentsByOrder).filter((shipment) =>
    ["pending", "in_transit", "delayed"].includes(shipment.status),
  );

  function updateShipmentForm(
    orderId: number,
    patch: Partial<ShipmentFormState>,
  ) {
    setShipmentForms((prev) => ({
      ...prev,
      [orderId]: {
        ...prev[orderId],
        ...patch,
      },
    }));
  }

  async function saveShipment(order: PurchaseOrder) {
    if (!token) return;
    const form = shipmentForms[order.id];
    if (!form?.trackingNumber.trim()) {
      setError("Tracking number is required before saving a freight update.");
      return;
    }

    setSavingOrderId(order.id);
    setError("");
    try {
      const res = await api<{ data: VendorShipment }>(
        `/api/vendors/purchase-orders/${order.id}/shipment`,
        {
          method: "PUT",
          token,
          body: {
            carrier: form.carrier,
            trackingNumber: form.trackingNumber,
            status: form.status,
            estimatedDelivery: form.estimatedDelivery || null,
            note: form.note || undefined,
            location: form.location || undefined,
          },
        },
      );

      setShipmentsByOrder((prev) => ({
        ...prev,
        [order.id]: res.data,
      }));
      setShipmentForms((prev) => ({
        ...prev,
        [order.id]: {
          ...prev[order.id],
          note: "",
        },
      }));
      setOrders((prev) =>
        prev.map((entry) =>
          entry.id === order.id
            ? {
                ...entry,
                status: res.data.purchaseOrderStatus ?? entry.status,
                updatedAt: new Date().toISOString(),
              }
            : entry,
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save freight update",
      );
    } finally {
      setSavingOrderId(null);
    }
  }

  if (user?.role && user.role !== "vendor") {
    return <p className="text-sm text-muted">Vendor access required.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Vendor Purchase Orders
          </h1>
          <p className="mt-1 text-sm text-muted">
            {openOrders.length} purchase orders are still active across
            production or freight movement.
          </p>
        </div>
        <div className="rounded-2xl border border-ai/20 bg-ai-light/20 px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ai-foreground">
            <Truck className="h-3.5 w-3.5" />
            Freight Control
          </div>
          <p className="mt-2 text-sm text-foreground">
            {activeShipments.length} shipment
            {activeShipments.length === 1 ? "" : "s"} currently need monitoring.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          label="Active POs"
          value={String(openOrders.length)}
          icon={Truck}
        />
        <SummaryCard
          label="In Transit"
          value={String(
            Object.values(shipmentsByOrder).filter(
              (shipment) => shipment.status === "in_transit",
            ).length,
          )}
          icon={Calendar}
        />
        <SummaryCard
          label="Delayed"
          value={String(
            Object.values(shipmentsByOrder).filter(
              (shipment) => shipment.status === "delayed",
            ).length,
          )}
          icon={AlertTriangle}
        />
      </div>

      <div className="rounded-2xl border border-border bg-surface shadow-sm">
        {loading ? (
          <div className="px-4 py-8">
            <ThinkingIndicator className="justify-center" />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {orders.map((order) => {
              const shipment = shipmentsByOrder[order.id];
              const form = shipmentForms[order.id];

              return (
                <div key={order.id} className="px-5 py-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-sm text-foreground">
                        {order.purchaseOrderNumber}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        Expected ship{" "}
                        {order.expectedShipDate
                          ? new Date(
                              order.expectedShipDate,
                            ).toLocaleDateString()
                          : "TBD"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={order.status} />
                      <p className="font-mono text-sm text-foreground">
                        $
                        {order.total.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-muted">
                          <th className="py-2 pr-3">Item</th>
                          <th className="py-2 pr-3">SKU</th>
                          <th className="py-2 pr-3 text-right">Qty</th>
                          <th className="py-2 pr-3 text-right">Unit Cost</th>
                          <th className="py-2 text-right">Line Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.lines.map((line) => (
                          <tr
                            key={`${order.id}-${line.productId}`}
                            className="border-t border-border"
                          >
                            <td className="py-2 pr-3 text-foreground">
                              {line.productName ?? "Unknown product"}
                            </td>
                            <td className="py-2 pr-3 font-mono text-xs text-muted">
                              {line.productSku ?? "-"}
                            </td>
                            <td className="py-2 pr-3 text-right">
                              {line.quantity}
                            </td>
                            <td className="py-2 pr-3 text-right font-mono">
                              ${line.unitCost.toFixed(2)}
                            </td>
                            <td className="py-2 text-right font-mono">
                              ${line.lineTotal.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {form && (
                    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                      <div className="rounded-2xl border border-border bg-background p-4">
                        <div className="flex items-center gap-2">
                          <Truck className="h-4 w-4 text-accent" />
                          <h2 className="text-sm font-semibold text-foreground">
                            Freight Update
                          </h2>
                        </div>
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <label className="space-y-1 text-sm text-foreground">
                            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                              Carrier
                            </span>
                            <input
                              value={form.carrier}
                              onChange={(event) =>
                                updateShipmentForm(order.id, {
                                  carrier: event.target.value,
                                })
                              }
                              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-ai focus:ring-1 focus:ring-ai focus:outline-none"
                            />
                          </label>
                          <label className="space-y-1 text-sm text-foreground">
                            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                              Tracking Number
                            </span>
                            <input
                              value={form.trackingNumber}
                              onChange={(event) =>
                                updateShipmentForm(order.id, {
                                  trackingNumber: event.target.value,
                                })
                              }
                              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-ai focus:ring-1 focus:ring-ai focus:outline-none"
                            />
                          </label>
                          <label className="space-y-1 text-sm text-foreground">
                            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                              Status
                            </span>
                            <select
                              value={form.status}
                              onChange={(event) =>
                                updateShipmentForm(order.id, {
                                  status: event.target
                                    .value as ShipmentFormState["status"],
                                })
                              }
                              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-ai focus:ring-1 focus:ring-ai focus:outline-none"
                            >
                              {STATUS_OPTIONS.map((status) => (
                                <option key={status} value={status}>
                                  {status.replace("_", " ")}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="space-y-1 text-sm text-foreground">
                            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                              Estimated Delivery
                            </span>
                            <input
                              type="date"
                              value={form.estimatedDelivery}
                              onChange={(event) =>
                                updateShipmentForm(order.id, {
                                  estimatedDelivery: event.target.value,
                                })
                              }
                              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-ai focus:ring-1 focus:ring-ai focus:outline-none"
                            />
                          </label>
                          <label className="space-y-1 text-sm text-foreground">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted">
                              <MapPin className="h-3 w-3" />
                              Location
                            </span>
                            <input
                              value={form.location}
                              onChange={(event) =>
                                updateShipmentForm(order.id, {
                                  location: event.target.value,
                                })
                              }
                              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-ai focus:ring-1 focus:ring-ai focus:outline-none"
                              placeholder="Chicago, IL"
                            />
                          </label>
                          <label className="space-y-1 text-sm text-foreground md:col-span-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                              Event Note
                            </span>
                            <textarea
                              rows={3}
                              value={form.note}
                              onChange={(event) =>
                                updateShipmentForm(order.id, {
                                  note: event.target.value,
                                })
                              }
                              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-ai focus:ring-1 focus:ring-ai focus:outline-none"
                              placeholder="Freight departed the consolidation hub."
                            />
                          </label>
                        </div>
                        <div className="mt-4 flex justify-end">
                          <button
                            type="button"
                            onClick={() => void saveShipment(order)}
                            disabled={savingOrderId === order.id}
                            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                          >
                            <Save className="h-4 w-4" />
                            {shipment ? "Update shipment" : "Create shipment"}
                          </button>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border bg-background p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                              Current Freight
                            </p>
                            <p className="mt-1 text-sm font-medium text-foreground">
                              {shipment?.carrier ?? form.carrier}
                            </p>
                            <p className="mt-1 text-xs font-mono text-muted">
                              {shipment?.trackingNumber ||
                                form.trackingNumber ||
                                "No tracking number yet"}
                            </p>
                          </div>
                          <StatusBadge
                            status={shipment?.status ?? form.status}
                          />
                        </div>

                        <div className="mt-4 space-y-3">
                          {(shipment?.events ?? [])
                            .slice(-4)
                            .reverse()
                            .map((event, index) => (
                              <div
                                key={`${event.timestamp}-${index}`}
                                className="rounded-xl border border-border bg-surface px-3 py-3"
                              >
                                <div className="flex items-start gap-2">
                                  <Truck className="mt-0.5 h-4 w-4 text-accent" />
                                  <div>
                                    <p className="text-sm text-foreground">
                                      {event.description}
                                    </p>
                                    <p className="mt-1 text-[11px] text-muted">
                                      {event.location
                                        ? `${event.location} · `
                                        : ""}
                                      {new Date(
                                        event.timestamp,
                                      ).toLocaleString()}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          {!(shipment?.events.length ?? 0) && (
                            <div className="rounded-xl border border-dashed border-border px-3 py-6 text-sm text-muted">
                              Save the first freight update to start the
                              tracking history.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {!orders.length && (
              <div className="px-4 py-8 text-center text-sm text-muted">
                No purchase orders found.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Truck;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-light/30 text-accent">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function createShipmentForm(
  shipment: VendorShipment | undefined,
  order: PurchaseOrder,
): ShipmentFormState {
  return {
    carrier: shipment?.carrier ?? "LTL Freight",
    trackingNumber: shipment?.trackingNumber ?? "",
    status:
      shipment?.status ??
      (order.status === "shipped" ? "in_transit" : "pending"),
    estimatedDelivery: shipment?.estimatedDelivery ?? "",
    note: "",
    location: "",
  };
}
