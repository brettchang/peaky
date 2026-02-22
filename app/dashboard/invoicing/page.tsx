import { Metadata } from "next";
import Link from "next/link";
import { getAllInvoiceLinks } from "@/lib/db";
import { isXeroConnected } from "@/lib/xero";
import { XeroConnectButton } from "@/components/XeroConnectButton";
import { InvoiceStatusBadge } from "@/components/InvoiceStatusBadge";
import type { XeroInvoiceStatus } from "@/lib/xero-types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Invoicing — Peak Client Portal",
};

export default async function InvoicingPage() {
  const xeroStatus = await isXeroConnected();
  const links = xeroStatus.connected ? await getAllInvoiceLinks() : [];

  // Compute summary counts
  const counts = { draft: 0, awaiting: 0, overdue: 0, paid: 0 };
  const now = new Date();

  for (const link of links) {
    if (!link.invoice) continue;
    switch (link.invoice.status) {
      case "DRAFT":
      case "SUBMITTED":
        counts.draft++;
        break;
      case "AUTHORISED": {
        const due = new Date(link.invoice.dueDate);
        if (due < now && link.invoice.amountDue > 0) {
          counts.overdue++;
        } else {
          counts.awaiting++;
        }
        break;
      }
      case "PAID":
        counts.paid++;
        break;
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
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function isOverdue(link: (typeof links)[0]) {
    if (!link.invoice) return false;
    if (link.invoice.status !== "AUTHORISED") return false;
    return new Date(link.invoice.dueDate) < now && link.invoice.amountDue > 0;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
      >
        &larr; Back to Dashboard
      </Link>

      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoicing</h1>
          <p className="mt-1 text-sm text-gray-500">
            Xero invoices linked to campaigns
          </p>
        </div>
        <XeroConnectButton
          connected={xeroStatus.connected}
          tenantName={xeroStatus.tenantName}
        />
      </div>

      {!xeroStatus.connected ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center">
          <p className="text-sm text-gray-500">
            Connect your Xero account to view and link invoices to campaigns.
          </p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-4">
              <p className="text-xs text-gray-500">Draft</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {counts.draft}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-4">
              <p className="text-xs text-gray-500">Awaiting Payment</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {counts.awaiting}
              </p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4">
              <p className="text-xs text-amber-600">Overdue</p>
              <p className="mt-1 text-2xl font-bold text-amber-700">
                {counts.overdue}
              </p>
            </div>
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-4">
              <p className="text-xs text-green-600">Paid</p>
              <p className="mt-1 text-2xl font-bold text-green-700">
                {counts.paid}
              </p>
            </div>
          </div>

          {/* Invoice table */}
          {links.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center">
              <p className="text-sm text-gray-500">
                No invoices linked to campaigns yet. Link invoices from
                individual campaign pages.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
                    <th className="px-4 py-3 font-medium">Invoice #</th>
                    <th className="px-4 py-3 font-medium">Client</th>
                    <th className="px-4 py-3 font-medium">Campaign</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Total</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Amount Due
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      Due Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {links.map((link) => (
                    <tr
                      key={link.id}
                      className={
                        isOverdue(link)
                          ? "bg-amber-50 hover:bg-amber-100"
                          : "hover:bg-gray-50"
                      }
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {link.invoice?.invoiceNumber || "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {link.clientName}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/${link.campaignId}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {link.campaignName}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {link.invoice ? (
                          <InvoiceStatusBadge
                            status={link.invoice.status as XeroInvoiceStatus}
                          />
                        ) : (
                          <span className="text-xs text-gray-400">
                            Unknown
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900">
                        {link.invoice
                          ? formatCurrency(
                              link.invoice.total,
                              link.invoice.currencyCode
                            )
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900">
                        {link.invoice
                          ? formatCurrency(
                              link.invoice.amountDue,
                              link.invoice.currencyCode
                            )
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {link.invoice
                          ? formatDate(link.invoice.dueDate)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
