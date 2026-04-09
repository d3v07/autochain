"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/status-badge";
import { ThinkingIndicator } from "@/components/thinking-indicator";

interface VendorInvoice {
  id: number;
  invoiceNumber: string;
  amount: number;
  status: string;
  dueDate: string;
  paidAt: string | null;
  createdAt: string;
}

export default function VendorInvoicesPage() {
  const { token, user } = useAuth();
  const [invoices, setInvoices] = useState<VendorInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || user?.role !== "vendor") return;
    api<{ data: VendorInvoice[] }>("/api/vendors/invoices", { token })
      .then((res) => setInvoices(res.data))
      .finally(() => setLoading(false));
  }, [token, user?.role]);

  const pendingAmount = useMemo(
    () =>
      invoices
        .filter((invoice) =>
          ["pending", "approved", "disputed"].includes(invoice.status),
        )
        .reduce((sum, invoice) => sum + invoice.amount, 0),
    [invoices],
  );

  if (user?.role && user.role !== "vendor") {
    return <p className="text-sm text-muted">Vendor access required.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Vendor Invoices</h1>
        <p className="mt-1 text-sm text-muted">
          ${pendingAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}{" "}
          is still pending approval, payment, or dispute resolution.
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
                <th className="px-4 py-2">Invoice #</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2">Due Date</th>
                <th className="px-4 py-2">Paid</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr
                  key={invoice.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-2 font-mono text-xs text-foreground">
                    {invoice.invoiceNumber}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={invoice.status} />
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    $
                    {invoice.amount.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                  <td className="px-4 py-2 text-muted">
                    {new Date(invoice.dueDate).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-muted">
                    {invoice.paidAt
                      ? new Date(invoice.paidAt).toLocaleDateString()
                      : "Not paid"}
                  </td>
                </tr>
              ))}
              {!invoices.length && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-sm text-muted"
                  >
                    No vendor invoices found.
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
