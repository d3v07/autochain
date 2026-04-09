"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/status-badge";
import { ThinkingIndicator } from "@/components/thinking-indicator";
import { Sparkles } from "lucide-react";

interface Invoice {
  id: number;
  invoiceNumber: string;
  orderNumber?: string;
  amount: number;
  status: string;
  dueDate: string;
  paidAt: string | null;
}

export default function InvoicesPage() {
  const { token } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingInvoiceId, setPayingInvoiceId] = useState<number | null>(null);

  useEffect(() => {
    if (!token) return;
    api<{ data: Invoice[] }>("/api/invoices", { token })
      .then((res) => setInvoices(res.data))
      .finally(() => setLoading(false));
  }, [token]);

  async function payInvoice(id: number) {
    if (!token) return;
    setPayingInvoiceId(id);
    try {
      await api(`/api/invoices/${id}/pay`, { method: "PATCH", token });
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === id
            ? { ...inv, status: "paid", paidAt: new Date().toISOString() }
            : inv,
        ),
      );
    } finally {
      setPayingInvoiceId(null);
    }
  }

  const overdueInvoices = invoices.filter((i) => i.status === "overdue");
  const overdueTotal = overdueInvoices.reduce((s, i) => s + i.amount, 0);

  return (
    <div>
      <h1 className="text-xl font-bold text-foreground">Invoices</h1>

      {/* AI Overdue Alert */}
      {!loading && overdueInvoices.length > 0 && (
        <div className="mt-4 flex items-start gap-3 rounded border-l-2 border-ai bg-ai-light/30 p-4">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-ai" />
          <div>
            <p className="text-sm font-medium text-foreground">
              {overdueInvoices.length} invoice
              {overdueInvoices.length > 1 ? "s are" : " is"} overdue totaling $
              {overdueTotal.toLocaleString("en-US", {
                minimumFractionDigits: 2,
              })}
            </p>
            <p className="mt-1 text-xs text-muted">
              Pay now to avoid service interruption.
            </p>
          </div>
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
                <th className="px-4 py-2">Invoice #</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2">Due Date</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-2 font-mono text-xs">
                    {inv.invoiceNumber}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    $
                    {inv.amount.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                  <td className="px-4 py-2 text-muted">
                    {new Date(inv.dueDate).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2">
                    {inv.status !== "paid" && (
                      <button
                        onClick={() => payInvoice(inv.id)}
                        disabled={payingInvoiceId === inv.id}
                        data-agent-id={`invoice-pay-${inv.id}`}
                        className="rounded bg-accent px-2 py-1 text-xs text-white hover:bg-accent-hover disabled:opacity-50"
                      >
                        {payingInvoiceId === inv.id ? (
                          <ThinkingIndicator
                            tone="light"
                            className="justify-center"
                          />
                        ) : (
                          "Pay Now"
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted">
                    No invoices
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
