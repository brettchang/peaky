import type { DashboardInvoiceStatus, XeroInvoiceStatus } from "@/lib/xero-types";

export function mapXeroToDashboardStatus(
  status?: XeroInvoiceStatus
): DashboardInvoiceStatus {
  switch (status) {
    case "DRAFT":
    case "SUBMITTED":
      return "DRAFT";
    case "PAID":
      return "PAID";
    default:
      return "AWAITING_PAYMENT";
  }
}

export function getEffectiveDashboardStatus(params: {
  dashboardStatus?: DashboardInvoiceStatus;
  xeroStatus?: XeroInvoiceStatus;
}): DashboardInvoiceStatus {
  if (params.dashboardStatus === "PAID") return "PAID";
  return mapXeroToDashboardStatus(params.xeroStatus);
}
