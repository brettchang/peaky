"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { InvoiceStatusBadge } from "./InvoiceStatusBadge";
import type { XeroInvoice, XeroInvoiceStatus } from "@/lib/xero-types";

interface InvoiceLinkModalProps {
  campaignId: string;
  existingInvoiceIds: string[];
  onClose: () => void;
}

export function InvoiceLinkModal({
  campaignId,
  existingInvoiceIds,
  onClose,
}: InvoiceLinkModalProps) {
  const router = useRouter();
  const [invoices, setInvoices] = useState<XeroInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [linking, setLinking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchInvoices() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      const res = await fetch(`/api/xero/search-invoices?${params}`);
      if (!res.ok) throw new Error("Failed to fetch invoices");
      const data = await res.json();
      setInvoices(data.invoices ?? []);
    } catch {
      setError("Failed to load invoices from Xero");
    } finally {
      setLoading(false);
    }
  }

  async function handleLink(invoiceId: string) {
    setLinking(invoiceId);
    setError(null);
    try {
      const res = await fetch("/api/xero/link-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, xeroInvoiceId: invoiceId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to link invoice");
      }
      router.refresh();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to link invoice");
    } finally {
      setLinking(null);
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    fetchInvoices();
  }

  function formatCurrency(amount: number, currency: string) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Link Xero Invoice
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            &times;
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-gray-100 px-6 py-3">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <input
              type="text"
              placeholder="Search invoices..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="rounded-md bg-gray-100 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              Search
            </button>
          </form>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Invoice list */}
        <div className="max-h-[50vh] overflow-y-auto px-6 py-3">
          {loading ? (
            <p className="py-8 text-center text-sm text-gray-500">
              Loading invoices from Xero...
            </p>
          ) : invoices.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              No invoices found
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                  <th className="pb-2 font-medium">Invoice #</th>
                  <th className="pb-2 font-medium">Contact</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 text-right font-medium">Total</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {invoices.map((inv) => {
                  const alreadyLinked = existingInvoiceIds.includes(
                    inv.invoiceID
                  );
                  return (
                    <tr key={inv.invoiceID} className="hover:bg-gray-50">
                      <td className="py-2.5 font-medium text-gray-900">
                        {inv.invoiceNumber || "—"}
                      </td>
                      <td className="py-2.5 text-gray-600">
                        {inv.contact.name}
                      </td>
                      <td className="py-2.5">
                        <InvoiceStatusBadge
                          status={inv.status as XeroInvoiceStatus}
                        />
                      </td>
                      <td className="py-2.5 text-right text-gray-900">
                        {formatCurrency(inv.total, inv.currencyCode)}
                      </td>
                      <td className="py-2.5 text-right">
                        {alreadyLinked ? (
                          <span className="text-xs text-gray-400">Linked</span>
                        ) : (
                          <button
                            onClick={() => handleLink(inv.invoiceID)}
                            disabled={linking === inv.invoiceID}
                            className="rounded-md bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                          >
                            {linking === inv.invoiceID ? "Linking..." : "Link"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
