import type { DashboardInvoiceStatus } from "@/lib/xero-types";

const statusStyles: Record<DashboardInvoiceStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  AWAITING_PAYMENT: "bg-amber-100 text-amber-700",
  PAID: "bg-green-100 text-green-700",
};

const statusLabels: Record<DashboardInvoiceStatus, string> = {
  DRAFT: "Draft",
  AWAITING_PAYMENT: "Awaiting Payment",
  PAID: "Paid",
};

export function DashboardInvoiceStatusBadge({
  status,
}: {
  status: DashboardInvoiceStatus;
}) {
  const style = statusStyles[status] ?? "bg-gray-100 text-gray-700";
  const label = statusLabels[status] ?? status;

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${style}`}
    >
      {label}
    </span>
  );
}
