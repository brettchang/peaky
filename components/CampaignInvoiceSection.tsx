"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { InvoiceStatusBadge } from "./InvoiceStatusBadge";
import { InvoiceLinkModal } from "./InvoiceLinkModal";
import type { CampaignInvoiceLink } from "@/lib/xero-types";

interface CampaignInvoiceSectionProps {
  campaignId: string;
  invoiceLinks: CampaignInvoiceLink[];
  complementaryCampaign: boolean;
  specialInvoicingInstructions?: string;
}

export function CampaignInvoiceSection({
  campaignId,
  invoiceLinks,
  complementaryCampaign,
  specialInvoicingInstructions,
}: CampaignInvoiceSectionProps) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdInvoiceUrl, setCreatedInvoiceUrl] = useState<string | null>(null);

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

  async function handleCreateInvoice() {
    setCreatingInvoice(true);
    setCreateMessage(null);
    setCreateError(null);
    setCreatedInvoiceUrl(null);
    try {
      const res = await fetch("/api/xero/create-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId }),
      });
      const raw = await res.text();
      let data: {
        error?: string;
        guidance?: string;
        invoiceNumber?: string;
        invoiceUrl?: string;
      } = {};
      if (raw) {
        try {
          data = JSON.parse(raw) as typeof data;
        } catch {
          data = {};
        }
      }
      if (!res.ok) {
        throw new Error(
          [data.error, data.guidance].filter(Boolean).join(" — ") ||
            "Failed to create Xero invoice"
        );
      }
      setCreateMessage(
        data.invoiceNumber
          ? `Invoice ${data.invoiceNumber} created.`
          : "Invoice created."
      );
      if (data.invoiceUrl) {
        setCreatedInvoiceUrl(data.invoiceUrl);
        window.open(data.invoiceUrl, "_blank", "noopener,noreferrer");
      }
      router.refresh();
    } catch (error: unknown) {
      setCreateError(
        error instanceof Error ? error.message : "Failed to create Xero invoice"
      );
    } finally {
      setCreatingInvoice(false);
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
  const isComplementaryCampaign = complementaryCampaign;

  return (
    <div className="mb-8 rounded-lg border border-gray-200 bg-white px-6 py-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Xero Invoices</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCreateInvoice}
            disabled={creatingInvoice || isComplementaryCampaign}
            className="rounded-md bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creatingInvoice
              ? "Creating..."
              : isComplementaryCampaign
                ? "Complementary"
                : "+ Create Invoice"}
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="rounded-md bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
          >
            + Link Invoice
          </button>
        </div>
      </div>
      {createMessage && (
        <p className="mb-3 text-xs text-green-600">
          {createMessage}
          {createdInvoiceUrl && (
            <>
              {" "}
              <a
                href={createdInvoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline"
              >
                Open in Xero
              </a>
            </>
          )}
        </p>
      )}
      {createError && <p className="mb-3 text-xs text-red-600">{createError}</p>}
      {isComplementaryCampaign && (
        <p className="mb-3 text-xs text-gray-500">
          This campaign is marked as complementary and does not require an
          invoice.
        </p>
      )}

      {specialInvoicingInstructions && (
        <div className="mb-4 rounded border border-gray-200 bg-gray-50 px-3 py-2">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Campaign Invoicing Instructions
          </p>
          <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
            {specialInvoicingInstructions}
          </p>
        </div>
      )}

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
                  <Link
                    href={`/dashboard/invoicing/${link.id}`}
                    className="underline decoration-gray-300 underline-offset-2 hover:text-blue-700"
                  >
                    {link.invoice?.invoiceNumber || link.xeroInvoiceId.slice(0, 8)}
                  </Link>
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
