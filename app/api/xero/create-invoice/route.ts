import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { customAlphabet } from "nanoid";
import { DASHBOARD_COOKIE_NAME, isDashboardAuthenticated } from "@/lib/dashboard-auth";
import { db, getCampaignById } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getXeroConnection } from "@/lib/xero";
import { sendSlackNotification } from "@/lib/slack";
import { getAppBaseUrl } from "@/lib/urls";
import type { DashboardInvoiceStatus, XeroInvoiceStatus } from "@/lib/xero-types";

const nanoid = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 16);

type XeroInvoiceCreateResponse = {
  Invoices?: Array<{
    InvoiceID?: string;
    InvoiceNumber?: string;
    Status?: string;
  }>;
};

interface XeroValidationError {
  Message?: string;
}

interface XeroValidationElement {
  ValidationErrors?: XeroValidationError[];
}

interface XeroErrorResponse {
  Message?: string;
  Elements?: XeroValidationElement[];
}

const DEFAULT_HST_TAX_TYPE = "CAN020";

function mapXeroToDashboardStatus(status?: string): DashboardInvoiceStatus {
  switch (status as XeroInvoiceStatus | undefined) {
    case "DRAFT":
    case "SUBMITTED":
      return "DRAFT";
    case "PAID":
      return "PAID";
    default:
      return "AWAITING_PAYMENT";
  }
}

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

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parsePaymentTermsDays(paymentTerms?: string): number {
  if (!paymentTerms) return 30;
  const m = paymentTerms.match(/(\d+)/);
  if (!m) return 30;
  const days = Number(m[1]);
  if (!Number.isFinite(days) || days <= 0) return 30;
  return days;
}

function resolveDueDate(campaign: Awaited<ReturnType<typeof getCampaignById>>): string {
  const now = new Date();
  const cadence = campaign?.billingOnboarding?.invoiceCadence;
  const days =
    cadence?.type === "lump-sum"
      ? parsePaymentTermsDays(cadence.paymentTerms)
      : 30;
  const due = new Date(now);
  due.setDate(due.getDate() + days);
  return toIsoDate(due);
}

function extractXeroValidationMessages(data: XeroErrorResponse | null): string[] {
  if (!data?.Elements || !Array.isArray(data.Elements)) return [];

  const messages: string[] = [];
  for (const element of data.Elements) {
    const errors = element?.ValidationErrors;
    if (!errors || !Array.isArray(errors)) continue;
    for (const err of errors) {
      const message = err?.Message?.trim();
      if (message) messages.push(message);
    }
  }
  return messages;
}

async function resolveTaxTypeForCampaign(params: {
  taxEligible: boolean;
}): Promise<{ taxType?: string; failureReason?: string }> {
  if (!params.taxEligible) return { taxType: "NONE" };

  const configured = process.env.XERO_HST_TAX_TYPE?.trim() ?? "";
  if (configured) return { taxType: configured };
  return { taxType: DEFAULT_HST_TAX_TYPE };
}

export async function POST(request: NextRequest) {
  try {
    const cookie = request.cookies.get(DASHBOARD_COOKIE_NAME);
    if (!(await isDashboardAuthenticated(cookie?.value))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const conn = await getXeroConnection();
    if (!conn) {
      return NextResponse.json(
        { error: "Xero not connected" },
        { status: 401 }
      );
    }

    const body = (await request.json()) as { campaignId?: string };
    const campaignId = body.campaignId?.trim();
    if (!campaignId) {
      return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
    }

    const campaign = await getCampaignById(campaignId);

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (campaign.complementaryCampaign) {
      return NextResponse.json(
        {
          error:
            "Campaign is marked as complementary and does not require an invoice.",
        },
        { status: 400 }
      );
    }

    const billing = campaign.billingOnboarding;
    const billingCompanyName = billing?.companyName?.trim();
    const billingContactEmail = billing?.billingContactEmail?.trim();
    const poNumber = billing?.poNumber?.trim();
    if (!billingCompanyName) {
      return NextResponse.json(
        { error: "Billing company name is required before creating an invoice" },
        { status: 400 }
      );
    }

    const lineItems = campaign.adLineItems ?? [];
    if (lineItems.length === 0) {
      return NextResponse.json(
        { error: "Campaign must have ad line items before creating an invoice" },
        { status: 400 }
      );
    }

    const today = toIsoDate(new Date());
    const dueDate = resolveDueDate(campaign);
    const accountCode = process.env.XERO_SALES_ACCOUNT_CODE?.trim();
    const taxResolution = await resolveTaxTypeForCampaign({
      taxEligible: campaign.taxEligible,
    });
    if (!taxResolution.taxType) {
      return NextResponse.json(
        {
          error:
            taxResolution.failureReason ??
            "Could not resolve a valid tax type for this campaign.",
          guidance:
            'Set XERO_HST_TAX_TYPE to a valid TaxType code or exact tax name in this Xero org (for example, "ON - HST on Sales (13%)").',
        },
        { status: 400 }
      );
    }
    const taxType = taxResolution.taxType;

    const xeroLineItems = lineItems.map((li) => ({
      Description: `${li.type} - ${li.publication ?? "The Peak"}`,
      Quantity: li.quantity,
      UnitAmount: li.pricePerUnit,
      ...(accountCode ? { AccountCode: accountCode } : {}),
      ...(taxType ? { TaxType: taxType } : {}),
    }));

    const invoicePayload = {
      Invoices: [
        {
          Type: "ACCREC",
          Contact: {
            Name: billingCompanyName,
            ...(billingContactEmail
              ? { EmailAddress: billingContactEmail }
              : {}),
          },
          Date: today,
          DueDate: dueDate,
          CurrencyCode: campaign.currency,
          LineAmountTypes: "Exclusive",
          LineItems: xeroLineItems,
          Reference: campaign.name,
          ...(poNumber ? { Reference: `${campaign.name} | PO ${poNumber}` } : {}),
          Status: "DRAFT",
        },
      ],
    };

    const response = await fetch("https://api.xero.com/api.xro/2.0/Invoices", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${conn.accessToken}`,
        "Xero-Tenant-Id": conn.tenantId,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(invoicePayload),
    });

    const raw = await response.text();
    let data: XeroInvoiceCreateResponse | XeroErrorResponse | null = null;
    if (raw) {
      try {
        data = JSON.parse(raw) as XeroInvoiceCreateResponse;
      } catch {
        data = null;
      }
    }

    if (!response.ok) {
      const errorData = data as XeroErrorResponse | null;
      const validationMessages = extractXeroValidationMessages(errorData);
      const messageParts = [
        errorData?.Message || `Xero invoice creation failed (${response.status})`,
        ...validationMessages,
      ].filter(Boolean);
      const message = messageParts.join(" — ");
      const guidance =
        response.status === 401
          ? "Xero authorization is missing invoice write scope. Reconnect Xero from Invoicing."
          : validationMessages.some((m) => /account code/i.test(m))
            ? "Set XERO_SALES_ACCOUNT_CODE to a valid revenue account code in Vercel env."
            : validationMessages.some((m) => /tax/i.test(m))
              ? "Set XERO_HST_TAX_TYPE to a valid tax type for this Xero org."
          : undefined;
      return NextResponse.json(
        { error: message, details: data, guidance },
        { status: 502 }
      );
    }

    const created = (data as XeroInvoiceCreateResponse | null)?.Invoices?.[0];
    const invoiceId = created?.InvoiceID;
    if (!invoiceId) {
      return NextResponse.json(
        { error: "Xero did not return an invoice ID", details: data },
        { status: 502 }
      );
    }

    try {
      await db.insert(schema.campaignInvoices).values({
        id: nanoid(),
        campaignId,
        xeroInvoiceId: invoiceId,
        dashboardStatus: mapXeroToDashboardStatus(created?.Status),
        linkedAt: new Date(),
        notes: "Created via Peak portal",
      });
    } catch (error) {
      if (!isMissingDashboardStatusColumnError(error)) throw error;
      await db.insert(schema.campaignInvoices).values({
        id: nanoid(),
        campaignId,
        xeroInvoiceId: invoiceId,
        linkedAt: new Date(),
        notes: "Created via Peak portal",
      });
    }

    void sendSlackNotification({
      event: "invoice.created",
      title: `Xero invoice created: ${campaign.name}`,
      fields: [
        { label: "Campaign ID", value: campaignId },
        { label: "Invoice ID", value: invoiceId },
        { label: "Invoice Number", value: created?.InvoiceNumber },
        { label: "Status", value: created?.Status },
        { label: "Billing Company", value: billingCompanyName },
      ],
      linkLabel: "Open Campaign",
      linkUrl: `${getAppBaseUrl()}/dashboard/${campaignId}`,
    }).catch((error: unknown) => {
      console.error("Slack notification failed (invoice.created):", error);
    });

    revalidatePath(`/dashboard/${campaignId}`);
    revalidatePath("/dashboard/invoicing");

    return NextResponse.json({
      success: true,
      invoiceId,
      invoiceNumber: created?.InvoiceNumber,
      status: created?.Status,
      invoiceUrl: `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${invoiceId}`,
    });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
    ) {
      return NextResponse.json(
        { error: "Invoice already linked to this campaign" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create Xero invoice",
      },
      { status: 500 }
    );
  }
}
