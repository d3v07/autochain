"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/status-badge";
import { ThinkingIndicator } from "@/components/thinking-indicator";

interface CatalogItem {
  id: number;
  vendorSku: string;
  productName: string | null;
  productCategory: string | null;
  unitCost: number;
  minimumOrderQty: number;
  leadTimeDays: number;
  availableQty: number;
  status: string;
  updatedAt: string;
}

export default function VendorCatalogPage() {
  const { token, user } = useAuth();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || user?.role !== "vendor") return;
    api<{ data: CatalogItem[] }>("/api/vendors/catalog", { token })
      .then((res) => setItems(res.data))
      .finally(() => setLoading(false));
  }, [token, user?.role]);

  const constrainedItems = useMemo(
    () => items.filter((item) => item.status === "constrained"),
    [items],
  );

  if (user?.role && user.role !== "vendor") {
    return <p className="text-sm text-muted">Vendor access required.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Vendor Catalog</h1>
        <p className="mt-1 text-sm text-muted">
          {constrainedItems.length} constrained items currently need buyer or
          operations follow-up.
        </p>
      </div>

      <div className="rounded border border-border bg-surface">
        {loading ? (
          <div className="px-4 py-6">
            <ThinkingIndicator className="justify-center" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2">Vendor SKU</th>
                <th className="px-4 py-2">Product</th>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2 text-right">Available</th>
                <th className="px-4 py-2 text-right">Lead Time</th>
                <th className="px-4 py-2 text-right">Unit Cost</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-2 font-mono text-xs text-foreground">
                    {item.vendorSku}
                  </td>
                  <td className="px-4 py-2 text-foreground">
                    {item.productName ?? "Unknown product"}
                  </td>
                  <td className="px-4 py-2 capitalize text-muted">
                    {item.productCategory ?? "-"}
                  </td>
                  <td className="px-4 py-2 text-right">{item.availableQty}</td>
                  <td className="px-4 py-2 text-right">{item.leadTimeDays}d</td>
                  <td className="px-4 py-2 text-right font-mono">
                    ${item.unitCost.toFixed(2)}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={item.status} />
                  </td>
                </tr>
              ))}
              {!items.length && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-sm text-muted"
                  >
                    No catalog items found.
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
