"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { InvoiceStatusBadge } from "./InvoiceStatusBadge";
import { InvoiceLinkModal } from "./InvoiceLinkModal";
import type { CampaignInvoiceLink } from "@/lib/xero-types";

interface CampaignInvoiceSectionProps {
  campaignId: string;
  invoiceLinks: CampaignInvoiceLink[];
}

export function CampaignInvoiceSection({
  campaignId,
  invoiceLinks,
}: CampaignInvoiceSectionProps) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [unlinking, setUnlinking] = useState<string | null>(null);

  async function handleUnlink(linkId: string) {
    setUnlinking(linkId);
    try {
      const res = await fetch("/api/xero/unlink-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setUnlinking(null);
    }
  }

  function formatCurrency(amount: number, currency: string) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  }

  function formatDate(dateStr: string) {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  const existingInvoiceIds = invoiceLinks.map((l) => l.xeroInvoiceId);

  return (
    <div className="mb-8 rounded-lg border border-gray-200 bg-white px-6 py-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Xero Invoices</h3>
        <button
          onClick={() => setShowModal(true)}
          className="rounded-md bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
        >
          + Link Invoice
        </button>
      </div>

      {invoiceLinks.length === 0 ? (
        <p className="text-sm text-gray-400">No invoices linked yet</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="pb-2 font-medium">Invoice #</th>
              <th className="pb-2 font-medium">Contact</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 text-right font-medium">Total</th>
              <th className="pb-2 text-right font-medium">Due</th>
              <th className="pb-2 text-right font-medium">Due Date</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {invoiceLinks.map((link) => (
              <tr key={link.id}>
                <td className="py-2.5 font-medium text-gray-900">
                  {link.invoice?.invoiceNumber || link.xeroInvoiceId.slice(0, 8)}
                </td>
                <td className="py-2.5 text-gray-600">
                  {link.invoice?.contact.name || "—"}
                </td>
                <td className="py-2.5">
                  {link.invoice ? (
                    <InvoiceStatusBadge status={link.invoice.status} />
                  ) : (
                    <span className="text-xs text-gray-400">Unknown</span>
                  )}
                </td>
                <td className="py-2.5 text-right text-gray-900">
                  {link.invoice
                    ? formatCurrency(link.invoice.total, link.invoice.currencyCode)
                    : "—"}
                </td>
                <td className="py-2.5 text-right text-gray-900">
                  {link.invoice
                    ? formatCurrency(link.invoice.amountDue, link.invoice.currencyCode)
                    : "—"}
                </td>
                <td className="py-2.5 text-right text-gray-600">
                  {link.invoice ? formatDate(link.invoice.dueDate) : "—"}
                </td>
                <td className="py-2.5 text-right">
                  <button
                    onClick={() => handleUnlink(link.id)}
                    disabled={unlinking === link.id}
                    className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                  >
                    {unlinking === link.id ? "..." : "Unlink"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showModal && (
        <InvoiceLinkModal
          campaignId={campaignId}
          existingInvoiceIds={existingInvoiceIds}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
