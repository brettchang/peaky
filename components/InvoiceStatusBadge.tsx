import type { XeroInvoiceStatus } from "@/lib/xero-types";

const statusStyles: Record<XeroInvoiceStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  SUBMITTED: "bg-blue-100 text-blue-700",
  AUTHORISED: "bg-amber-100 text-amber-700",
  PAID: "bg-green-100 text-green-700",
  VOIDED: "bg-red-100 text-red-700",
  DELETED: "bg-red-100 text-red-700",
};

const statusLabels: Record<XeroInvoiceStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  AUTHORISED: "Awaiting Payment",
  PAID: "Paid",
  VOIDED: "Voided",
  DELETED: "Deleted",
};

export function InvoiceStatusBadge({ status }: { status: XeroInvoiceStatus }) {
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
