"use client";

import { useEffect, useMemo, useState } from "react";
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

export default function VendorPurchaseOrdersPage() {
  const { token, user } = useAuth();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || user?.role !== "vendor") return;
    api<{ data: PurchaseOrder[] }>("/api/vendors/purchase-orders", { token })
      .then((res) => setOrders(res.data))
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

  if (user?.role && user.role !== "vendor") {
    return <p className="text-sm text-muted">Vendor access required.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">
          Vendor Purchase Orders
        </h1>
        <p className="mt-1 text-sm text-muted">
          {openOrders.length} purchase orders are still active across production
          or shipment.
        </p>
      </div>

      <div className="rounded border border-border bg-surface">
        {loading ? (
          <div className="px-4 py-6">
            <ThinkingIndicator className="justify-center" />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {orders.map((order) => (
              <div key={order.id} className="px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm text-foreground">
                      {order.purchaseOrderNumber}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Expected ship{" "}
                      {order.expectedShipDate
                        ? new Date(order.expectedShipDate).toLocaleDateString()
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
                <div className="mt-3 overflow-x-auto">
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
              </div>
            ))}
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
