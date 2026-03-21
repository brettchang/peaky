import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { updateCampaignInvoiceDashboardStatus } from "@/lib/db";
import type { DashboardInvoiceStatus } from "@/lib/xero-types";

const VALID_STATUSES: DashboardInvoiceStatus[] = [
  "DRAFT",
  "AWAITING_PAYMENT",
  "PAID",
];

function isMissingDashboardStatusColumnError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const message = "message" in error ? String(error.message) : "";
  const causeMessage =
    "cause" in error && typeof error.cause === "object" && error.cause !== null
      ? "message" in error.cause
        ? String(error.cause.message)
        : ""
      : "";
  return (
    message.includes("dashboard_status") ||
    causeMessage.includes("dashboard_status")
  );
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    invoiceLinkId?: string;
    dashboardStatus?: DashboardInvoiceStatus;
    isPaid?: boolean;
  };

  const invoiceLinkId = body.invoiceLinkId?.trim();
  const dashboardStatus =
    body.dashboardStatus ??
    (body.isPaid === true
      ? "PAID"
      : body.isPaid === false
      ? "AWAITING_PAYMENT"
      : undefined);

  if (!invoiceLinkId || !dashboardStatus) {
    return NextResponse.json(
      { error: "invoiceLinkId and dashboardStatus are required" },
      { status: 400 }
    );
  }

  if (!VALID_STATUSES.includes(dashboardStatus)) {
    return NextResponse.json(
      { error: "Invalid dashboard status" },
      { status: 400 }
    );
  }

  let updated = false;
  try {
    updated = await updateCampaignInvoiceDashboardStatus(
      invoiceLinkId,
      dashboardStatus
    );
  } catch (error) {
    if (!isMissingDashboardStatusColumnError(error)) throw error;
    return NextResponse.json(
      { error: "Dashboard status is not available until DB migration runs" },
      { status: 409 }
    );
  }

  if (!updated) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  revalidatePath("/dashboard/invoicing");
  revalidatePath(`/dashboard/invoicing/${invoiceLinkId}`);

  return NextResponse.json({ success: true });
}
