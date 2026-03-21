import { Metadata } from "next";
import Link from "next/link";
import { getAllCampaignsWithClients, getAllInvoiceLinks } from "@/lib/db";
import { isXeroConnected } from "@/lib/xero";
import { XeroConnectButton } from "@/components/XeroConnectButton";
import { InvoiceStatusBadge } from "@/components/InvoiceStatusBadge";
import { DashboardInvoiceStatusBadge } from "@/components/DashboardInvoiceStatusBadge";
import type { XeroInvoiceStatus } from "@/lib/xero-types";
import { getEffectiveDashboardStatus } from "@/lib/invoice-status";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Invoicing — Peak Client Portal",
};

type InvoiceLink = Awaited<ReturnType<typeof getAllInvoiceLinks>>[number];

type InvoicingView = "linked" | "long-term" | "missing";

interface MonthlyInvoiceGroup {
  key: string;
  label: string;
  sortValue: number;
  links: InvoiceLink[];
}

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

function toMonthGroup(link: InvoiceLink): {
  key: string;
  label: string;
  sortValue: number;
} {
  const dueDate = link.invoice?.dueDate;
  if (!dueDate) {
    return {
      key: "no-due-date",
      label: "No Due Date",
      sortValue: Number.MAX_SAFE_INTEGER,
    };
  }
  const parsed = new Date(dueDate);
  if (Number.isNaN(parsed.getTime())) {
    return {
      key: "invalid-due-date",
      label: "Invalid Due Date",
      sortValue: Number.MAX_SAFE_INTEGER - 1,
    };
  }

  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth();
  const monthStart = new Date(Date.UTC(year, month, 1));
  const label = monthStart.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return {
    key: `${year}-${String(month + 1).padStart(2, "0")}`,
    label,
    sortValue: monthStart.getTime(),
  };
}

function groupByDueMonth(links: InvoiceLink[]): MonthlyInvoiceGroup[] {
  const groups = new Map<string, MonthlyInvoiceGroup>();
  for (const link of links) {
    const month = toMonthGroup(link);
    const existing = groups.get(month.key);
    if (existing) {
      existing.links.push(link);
      continue;
    }
    groups.set(month.key, {
      key: month.key,
      label: month.label,
      sortValue: month.sortValue,
      links: [link],
    });
  }

  return Array.from(groups.values()).sort((a, b) => a.sortValue - b.sortValue);
}

function sumByCurrency(
  links: InvoiceLink[],
  amountSelector: (link: InvoiceLink) => number | undefined
) {
  const totals = new Map<string, number>();
  for (const link of links) {
    if (!link.invoice) continue;
    const amount = amountSelector(link);
    if (typeof amount !== "number") continue;
    const currency = link.invoice.currencyCode || "CAD";
    totals.set(currency, (totals.get(currency) ?? 0) + amount);
  }
  return totals;
}

function formatCurrencyTotals(totals: Map<string, number>): string {
  if (totals.size === 0) return "—";
  return Array.from(totals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => formatCurrency(amount, currency))
    .join(" · ");
}

function isOverdue(link: InvoiceLink, now: Date) {
  if (!link.invoice) return false;
  if (link.invoice.status !== "AUTHORISED") return false;
  const due = new Date(link.invoice.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  return due < now && link.invoice.amountDue > 0;
}

function MonthlyLinkedInvoiceTable({
  links,
  now,
}: {
  links: InvoiceLink[];
  now: Date;
}) {
  const groups = groupByDueMonth(links);

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const total = formatCurrencyTotals(
          sumByCurrency(group.links, (link) => link.invoice?.total)
        );
        const due = formatCurrencyTotals(
          sumByCurrency(group.links, (link) => link.invoice?.amountDue)
        );
        return (
          <div
            key={group.key}
            className="overflow-hidden rounded-lg border border-gray-200 bg-white"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-sm font-semibold text-gray-900">{group.label}</p>
              <p className="text-xs text-gray-600">
                Total: <span className="font-medium text-gray-900">{total}</span>
                {" · "}
                Due: <span className="font-medium text-gray-900">{due}</span>
              </p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-white text-left text-xs text-gray-500">
                  <th className="px-4 py-3 font-medium">Invoice #</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Campaign</th>
                  <th className="px-4 py-3 font-medium">Xero Status</th>
                  <th className="px-4 py-3 font-medium">Dashboard Status</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 text-right font-medium">Amount Due</th>
                  <th className="px-4 py-3 text-right font-medium">Due Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {group.links.map((link) => {
                  const effectiveDashboardStatus = getEffectiveDashboardStatus({
                    dashboardStatus: link.dashboardStatus,
                    xeroStatus: link.invoice?.status as
                      | XeroInvoiceStatus
                      | undefined,
                  });
                  return (
                    <tr
                      key={link.id}
                      className={
                        isOverdue(link, now)
                          ? "bg-amber-50 hover:bg-amber-100"
                          : "hover:bg-gray-50"
                      }
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <Link
                          href={`/dashboard/invoicing/${link.id}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {link.invoice?.invoiceNumber || "—"}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{link.clientName}</td>
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
                          <span className="text-xs text-gray-400">Unknown</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <DashboardInvoiceStatusBadge
                          status={effectiveDashboardStatus}
                        />
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
                        {formatDate(link.invoice?.dueDate)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

export default async function InvoicingPage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const viewParam = params?.view;
  const view: InvoicingView =
    viewParam === "long-term"
      ? "long-term"
      : viewParam === "missing"
        ? "missing"
        : "linked";

  const xeroStatus = await isXeroConnected();
  const [links, campaigns] = xeroStatus.connected
    ? await Promise.all([getAllInvoiceLinks(), getAllCampaignsWithClients()])
    : [[], []];
  const now = new Date();

  const billableCampaigns = campaigns.filter(
    ({ campaign }) => !campaign.complementaryCampaign
  );
  const billableCampaignIds = new Set(
    billableCampaigns.map(({ campaign }) => campaign.id)
  );
  const billableLinks = links.filter((link) =>
    billableCampaignIds.has(link.campaignId)
  );

  const linkedCampaignIds = new Set(billableLinks.map((link) => link.campaignId));
  const missingCampaigns = billableCampaigns.filter(
    ({ campaign }) => !linkedCampaignIds.has(campaign.id)
  );
  const longTermCampaignIds = new Set(
    billableCampaigns
      .filter(({ campaign }) => campaign.longTermClient)
      .map(({ campaign }) => campaign.id)
  );
  const longTermLinks = billableLinks.filter((link) =>
    longTermCampaignIds.has(link.campaignId)
  );

  // Compute summary counts
  const counts = { draft: 0, awaiting: 0, overdue: 0, paid: 0 };
  for (const link of billableLinks) {
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

  const longTermByMonth = groupByDueMonth(longTermLinks);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
      >
        &larr; Back to Dashboard
      </Link>

      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoicing</h1>
          <p className="mt-1 text-sm text-gray-500">
            {view === "missing"
              ? "Campaigns without linked Xero invoices"
              : view === "long-term"
                ? "Long-term clients and invoices, grouped by due month"
                : "All linked invoices, grouped by due month"}
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

          <div className="mb-4 inline-flex rounded-lg border border-gray-200 bg-white p-1">
            <Link
              href="/dashboard/invoicing"
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                view === "linked"
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Linked Invoices ({billableLinks.length})
            </Link>
            <Link
              href="/dashboard/invoicing?view=long-term"
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                view === "long-term"
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Long-term Clients ({longTermLinks.length})
            </Link>
            <Link
              href="/dashboard/invoicing?view=missing"
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                view === "missing"
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Missing Invoices ({missingCampaigns.length})
            </Link>
          </div>

          {view === "linked" ? (
            billableLinks.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center">
                <p className="text-sm text-gray-500">
                  No invoices linked to campaigns yet. Link invoices from
                  individual campaign pages.
                </p>
              </div>
            ) : (
              <MonthlyLinkedInvoiceTable links={billableLinks} now={now} />
            )
          ) : view === "long-term" ? (
            longTermByMonth.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center">
                <p className="text-sm text-gray-500">
                  No invoices found for campaigns marked as long-term clients.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {longTermByMonth.map((month) => {
                  const monthTotal = formatCurrencyTotals(
                    sumByCurrency(month.links, (link) => link.invoice?.total)
                  );
                  const byClient = new Map<string, InvoiceLink[]>();
                  for (const link of month.links) {
                    const key = link.clientName || "Unknown Client";
                    if (!byClient.has(key)) byClient.set(key, []);
                    byClient.get(key)!.push(link);
                  }

                  return (
                    <div
                      key={month.key}
                      className="overflow-hidden rounded-lg border border-gray-200 bg-white"
                    >
                      <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                        <p className="text-sm font-semibold text-gray-900">
                          {month.label}
                        </p>
                        <p className="text-xs text-gray-600">
                          Monthly total:{" "}
                          <span className="font-medium text-gray-900">
                            {monthTotal}
                          </span>
                        </p>
                      </div>

                      <div className="space-y-4 p-4">
                        {Array.from(byClient.entries())
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([clientName, clientLinks]) => {
                            const clientTotal = formatCurrencyTotals(
                              sumByCurrency(
                                clientLinks,
                                (link) => link.invoice?.total
                              )
                            );
                            return (
                              <div key={`${month.key}-${clientName}`}>
                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-sm font-semibold text-gray-900">
                                    {clientName}
                                  </p>
                                  <p className="text-xs text-gray-600">
                                    Client total:{" "}
                                    <span className="font-medium text-gray-900">
                                      {clientTotal}
                                    </span>
                                  </p>
                                </div>
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                                      <th className="px-0 py-2 font-medium">
                                        Invoice #
                                      </th>
                                      <th className="px-0 py-2 font-medium">
                                        Campaign
                                      </th>
                                      <th className="px-0 py-2 font-medium">
                                        Status
                                      </th>
                                      <th className="px-0 py-2 text-right font-medium">
                                        Total
                                      </th>
                                      <th className="px-0 py-2 text-right font-medium">
                                        Due Date
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {clientLinks.map((link) => (
                                      <tr key={link.id}>
                                        <td className="py-2.5 font-medium text-gray-900">
                                          <Link
                                            href={`/dashboard/invoicing/${link.id}`}
                                            className="text-blue-600 hover:text-blue-800 hover:underline"
                                          >
                                            {link.invoice?.invoiceNumber || "—"}
                                          </Link>
                                        </td>
                                        <td className="py-2.5 text-gray-700">
                                          <Link
                                            href={`/dashboard/${link.campaignId}`}
                                            className="text-blue-600 hover:text-blue-800 hover:underline"
                                          >
                                            {link.campaignName}
                                          </Link>
                                        </td>
                                        <td className="py-2.5">
                                          {link.invoice ? (
                                            <InvoiceStatusBadge
                                              status={
                                                link.invoice.status as XeroInvoiceStatus
                                              }
                                            />
                                          ) : (
                                            <span className="text-xs text-gray-400">
                                              Unknown
                                            </span>
                                          )}
                                        </td>
                                        <td className="py-2.5 text-right text-gray-900">
                                          {link.invoice
                                            ? formatCurrency(
                                                link.invoice.total,
                                                link.invoice.currencyCode
                                              )
                                            : "—"}
                                        </td>
                                        <td className="py-2.5 text-right text-gray-600">
                                          {formatDate(link.invoice?.dueDate)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : missingCampaigns.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center">
              <p className="text-sm text-gray-500">
                Every campaign currently has at least one linked invoice.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
                    <th className="px-4 py-3 font-medium">Client</th>
                    <th className="px-4 py-3 font-medium">Campaign</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Long-term</th>
                    <th className="px-4 py-3 font-medium">Invoice Cadence</th>
                    <th className="px-4 py-3 font-medium">
                      Invoicing Instructions
                    </th>
                    <th className="px-4 py-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {missingCampaigns.map(({ campaign, clientName }) => (
                    <tr key={campaign.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600">{clientName}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {campaign.name}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{campaign.status}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {campaign.longTermClient ? "Yes" : "No"}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {campaign.billingOnboarding?.invoiceCadence?.type ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        <span className="line-clamp-2">
                          {campaign.billingOnboarding?.specialInstructions || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/dashboard/${campaign.id}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          Open Campaign
                        </Link>
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
