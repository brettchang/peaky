import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getInvoiceLinkById } from "@/lib/db";
import { InvoiceStatusBadge } from "@/components/InvoiceStatusBadge";
import { DashboardInvoiceStatusBadge } from "@/components/DashboardInvoiceStatusBadge";
import { InvoiceDashboardStatusEditor } from "@/components/InvoiceDashboardStatusEditor";
import { InvoiceNoteEditor } from "@/components/InvoiceNoteEditor";
import { InvoiceUnlinkButton } from "@/components/InvoiceUnlinkButton";
import type { XeroInvoiceStatus } from "@/lib/xero-types";
import { getEffectiveDashboardStatus } from "@/lib/invoice-status";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Invoice Detail — Peak Client Portal",
};

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

function formatDate(dateStr: string | undefined) {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ invoiceLinkId: string }>;
}) {
  const { invoiceLinkId } = await params;
  const link = await getInvoiceLinkById(invoiceLinkId);

  if (!link) {
    notFound();
  }

  const invoice = link.invoice;
  const effectiveDashboardStatus = getEffectiveDashboardStatus({
    dashboardStatus: link.dashboardStatus,
    xeroStatus: invoice?.status as XeroInvoiceStatus | undefined,
  });
  const taxAmount =
    invoice && link.campaignTaxEligible ? invoice.total * 0.13 : undefined;
  const invoiceCurrency = invoice?.currencyCode ?? "CAD";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link
        href="/dashboard/invoicing"
        className="mb-6 inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
      >
        &larr; Back to Invoicing
      </Link>

      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Invoice {invoice?.invoiceNumber || link.xeroInvoiceId.slice(0, 8)}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {link.clientName} • {link.campaignName}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <a
              href={`https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${link.xeroInvoiceId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Open in Xero
            </a>
            <InvoiceUnlinkButton linkId={link.id} />
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
              Status in Xero
            </p>
            {invoice ? (
              <InvoiceStatusBadge status={invoice.status as XeroInvoiceStatus} />
            ) : (
              <span className="text-sm text-gray-400">Unknown</span>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
              Status on Dashboard
            </p>
            <div className="mb-3">
              <DashboardInvoiceStatusBadge status={effectiveDashboardStatus} />
            </div>
            <InvoiceDashboardStatusEditor
              invoiceLinkId={link.id}
              initialStatus={link.dashboardStatus ?? effectiveDashboardStatus}
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Invoice Details</h2>
        <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">Total</dt>
            <dd className="mt-1 text-gray-900">
              {invoice
                ? formatCurrency(invoice.total, invoice.currencyCode)
                : "—"}
            </dd>
            {taxAmount !== undefined && (
              <p className="mt-1 text-xs text-gray-500">
                Includes HST (13%):{" "}
                {formatCurrency(taxAmount, invoiceCurrency)}
              </p>
            )}
          </div>
          <div>
            <dt className="text-gray-500">Amount Due</dt>
            <dd className="mt-1 text-gray-900">
              {invoice
                ? formatCurrency(invoice.amountDue, invoice.currencyCode)
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Amount Paid</dt>
            <dd className="mt-1 text-gray-900">
              {invoice
                ? formatCurrency(invoice.amountPaid, invoice.currencyCode)
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Due Date</dt>
            <dd className="mt-1 text-gray-900">{formatDate(invoice?.dueDate)}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Invoice Date</dt>
            <dd className="mt-1 text-gray-900">{formatDate(invoice?.date)}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Linked At</dt>
            <dd className="mt-1 text-gray-900">{formatDate(link.linkedAt)}</dd>
          </div>
        </dl>
      </div>

      {link.campaignBillingSpecialInstructions && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">
            Campaign Invoicing Instructions
          </h2>
          <p className="text-sm text-gray-900 whitespace-pre-wrap">
            {link.campaignBillingSpecialInstructions}
          </p>
        </div>
      )}

      <div className="mt-6">
        <InvoiceNoteEditor invoiceLinkId={link.id} initialNote={link.notes} />
      </div>
    </div>
  );
}
