import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { DASHBOARD_COOKIE_NAME, isDashboardAuthenticated } from "@/lib/dashboard-auth";
import { getCampaignById, getClientByCampaignId, updateCampaignPandaDoc } from "@/lib/db";
import type { AdLineItem } from "@/lib/types";
import { sendSlackNotification } from "@/lib/slack";
import { getAppBaseUrl } from "@/lib/urls";

const PANDADOC_API_BASE = "https://api.pandadoc.com/public/v1";
const DEFAULT_TEMPLATE_NAME = "Peak Portal Insertion Order";
const IO_CC_EMAIL = "adops@thepeakmediaco.com";

interface PandaDocCreateResponse {
  id?: string;
  status?: string;
  document_id?: string;
}

interface PandaDocContact {
  id: string;
  email?: string;
  first_name?: string;
  last_name?: string;
}

function parseName(fullName?: string): { firstName: string; lastName: string } {
  if (!fullName?.trim()) {
    return { firstName: "Billing", lastName: "Contact" };
  }
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "Contact" };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function getNumeric(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function buildLineItems(adLineItems: AdLineItem[]) {
  return adLineItems.map((lineItem) => ({
    options: {},
    data: {
      name: `${lineItem.type} - ${lineItem.publication ?? "The Peak"}`,
      description: "Scheduling date to be selected by client",
      price: String(getNumeric(lineItem.pricePerUnit)),
      qty: String(lineItem.quantity),
      discount: {
        type: "percent",
        value: "0",
      },
    },
  }));
}

async function pandadocFetch<T>(
  path: string,
  apiKey: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${PANDADOC_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `API-Key ${apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const raw = await res.text();
  let data: unknown = undefined;
  if (raw) {
    try {
      data = JSON.parse(raw) as unknown;
    } catch {
      data = undefined;
    }
  }

  if (!res.ok) {
    const errorDetail =
      typeof data === "object" &&
      data !== null &&
      "detail" in data &&
      typeof (data as { detail?: unknown }).detail === "string"
        ? (data as { detail: string }).detail
        : raw || "No error body returned";
    throw new Error(
      `PandaDoc request failed (${res.status}) on ${path}: ${errorDetail}`
    );
  }

  return data as T;
}

async function resolveTemplateUuid(apiKey: string): Promise<string> {
  const fromEnv = process.env.PANDADOC_TEMPLATE_UUID?.trim();
  if (fromEnv) return fromEnv;

  const targetName = (process.env.PANDADOC_TEMPLATE_NAME || DEFAULT_TEMPLATE_NAME).trim();
  const response = await pandadocFetch<{
    results?: Array<{ id?: string; uuid?: string; name?: string }>;
  }>(
    `/templates?q=${encodeURIComponent(targetName)}`,
    apiKey,
    { method: "GET" }
  );

  const templates = response.results ?? [];
  const exact = templates.find(
    (t) =>
      t.name?.trim().toLowerCase() === targetName.toLowerCase() &&
      (t.uuid || t.id)
  );
  if (exact?.uuid) return exact.uuid;
  if (exact?.id) return exact.id;

  const first = templates.find((t) => t.uuid || t.id);
  if (first?.uuid) return first.uuid;
  if (first?.id) return first.id;

  throw new Error(
    `No PandaDoc template found for \"${targetName}\". Set PANDADOC_TEMPLATE_UUID to skip lookup.`
  );
}

async function ensureContact(apiKey: string, email: string): Promise<string> {
  const contacts = await pandadocFetch<{ results?: PandaDocContact[] }>(
    `/contacts?q=${encodeURIComponent(email)}`,
    apiKey,
    { method: "GET" }
  );

  const existing = (contacts.results ?? []).find(
    (contact) => contact.email?.toLowerCase() === email.toLowerCase()
  );
  if (existing?.id) return existing.id;

  const created = await pandadocFetch<PandaDocContact>(`/contacts`, apiKey, {
    method: "POST",
    body: JSON.stringify({
      email,
      first_name: "AdOps",
      last_name: "Team",
    }),
  });

  if (!created.id) {
    throw new Error("Unable to create PandaDoc contact for CC recipient");
  }

  return created.id;
}

async function addCcRecipient(
  apiKey: string,
  documentId: string,
  email: string
): Promise<void> {
  const contactId = await ensureContact(apiKey, email);
  await pandadocFetch(`/documents/${documentId}/recipients`, apiKey, {
    method: "POST",
    body: JSON.stringify({
      kind: "contact",
      id: contactId,
    }),
  });
}

export async function POST(request: NextRequest) {
  try {
    const cookie = request.cookies.get(DASHBOARD_COOKIE_NAME);
    if (!(await isDashboardAuthenticated(cookie?.value))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKey = process.env.PANDADOC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "PANDADOC_API_KEY is not configured" },
        { status: 500 }
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
    const client = await getClientByCampaignId(campaignId);

    const billing = campaign.billingOnboarding;
    if (!billing) {
      return NextResponse.json(
        { error: "Billing onboarding must be completed before creating an IO" },
        { status: 400 }
      );
    }
    const billingEmail = billing?.billingContactEmail?.trim();
    const billingName = billing?.billingContactName?.trim();
    const ioSigningEmail = billing?.ioSigningContactEmail?.trim() || billingEmail;
    const ioSigningName = billing?.ioSigningContactName?.trim() || billingName;

    if (!billingEmail || !billingName) {
      return NextResponse.json(
        { error: "Billing contact name and email are required before creating an IO" },
        { status: 400 }
      );
    }
    if (!ioSigningEmail || !ioSigningName) {
      return NextResponse.json(
        { error: "IO signing contact name and email are required before creating an IO" },
        { status: 400 }
      );
    }

    const adLineItems = campaign.adLineItems ?? [];
    if (adLineItems.length === 0) {
      return NextResponse.json(
        { error: "Campaign must have ad line items before creating an IO" },
        { status: 400 }
      );
    }

    const { firstName, lastName } = parseName(ioSigningName);
    const subtotal = getNumeric(
      adLineItems.reduce((sum, lineItem) => sum + lineItem.quantity * lineItem.pricePerUnit, 0)
    );
    const taxRate = campaign.taxEligible ? 13 : 0;
    const taxAmount = getNumeric((subtotal * taxRate) / 100);
    const total = getNumeric(subtotal + taxAmount);

    const templateUuid = await resolveTemplateUuid(apiKey);
    const recipientRole = process.env.PANDADOC_RECIPIENT_ROLE?.trim() || "Client";
    const pricingTableName =
      process.env.PANDADOC_PRICING_TABLE_NAME?.trim() || "Insertion Order Pricing";

    const pricingTable: Record<string, unknown> = {
      sections: [
        {
          title: "Advertisement Information",
          default: true,
          rows: buildLineItems(adLineItems),
        },
      ],
      options: {
        currency: campaign.currency,
      },
    };

    pricingTable.name = pricingTableName;

    const payload: Record<string, unknown> = {
      name: `${campaign.name} - Insertion Order`,
      template_uuid: templateUuid,
      recipients: [
        {
          email: ioSigningEmail,
          first_name: firstName,
          last_name: lastName,
          role: recipientRole,
        },
      ],
      pricing_tables: [pricingTable],
      tokens: [
        { name: "campaign.id", value: campaign.id },
        { name: "campaign.name", value: campaign.name },
        { name: "campaign.status", value: campaign.status },
        { name: "client.name", value: client?.name ?? "" },
        { name: "sales.person", value: campaign.salesPerson ?? "" },
        { name: "campaign.manager", value: campaign.campaignManager ?? "" },
        { name: "contact.primary_name", value: ioSigningName },
        { name: "contact.primary_email", value: ioSigningEmail },
        { name: "billing.company_name", value: billing.companyName ?? "" },
        { name: "billing.contact_name", value: billingName },
        { name: "billing.contact_email", value: billingEmail },
        { name: "billing.address", value: billing.billingAddress ?? "" },
        { name: "billing.po_number", value: billing.poNumber ?? "" },
        {
          name: "billing.invoice_cadence_type",
          value: billing.invoiceCadence?.type ?? "",
        },
        {
          name: "billing.special_instructions",
          value: billing.specialInstructions ?? "",
        },
        { name: "io.currency", value: campaign.currency },
        { name: "io.subtotal_pre_tax", value: subtotal.toFixed(2) },
        { name: "tax.mode", value: "exclusive" },
        { name: "tax.name", value: campaign.taxEligible ? "HST" : "" },
        { name: "tax.rate_percent", value: String(taxRate) },
        { name: "tax.amount", value: taxAmount.toFixed(2) },
        { name: "io.total_with_tax", value: total.toFixed(2) },
        { name: "io.date_mode", value: "tbd" },
      ],
    };

    const created = await pandadocFetch<PandaDocCreateResponse>(`/documents`, apiKey, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const documentId = created.id ?? created.document_id;
    if (!documentId) {
      return NextResponse.json(
        { error: "PandaDoc did not return a document id" },
        { status: 502 }
      );
    }

    let ccWarning: string | undefined;
    try {
      await addCcRecipient(apiKey, documentId, IO_CC_EMAIL);
    } catch (err: unknown) {
      ccWarning =
        err instanceof Error
          ? `IO created, but failed to add CC recipient (${err.message})`
          : "IO created, but failed to add CC recipient";
    }

    const documentUrl = `https://app.pandadoc.com/a/#/documents/${documentId}`;

    await updateCampaignPandaDoc(campaignId, {
      documentId,
      status: created.status ?? "document.draft",
      documentUrl,
      createdAt: new Date(),
    });

    void sendSlackNotification({
      event: "io.created",
      title: `PandaDoc IO created: ${campaign.name}`,
      fields: [
        { label: "Campaign ID", value: campaignId },
        { label: "Client", value: client?.name },
        { label: "PandaDoc ID", value: documentId },
        { label: "Status", value: created.status ?? "document.draft" },
      ],
      linkLabel: "Open Campaign",
      linkUrl: `${getAppBaseUrl()}/dashboard/${campaignId}`,
    }).catch((error: unknown) => {
      console.error("Slack notification failed (io.created):", error);
    });

    revalidatePath("/dashboard", "layout");
    revalidatePath(`/dashboard/${campaignId}`);

    return NextResponse.json({
      success: true,
      documentId,
      status: created.status ?? "document.draft",
      documentUrl,
      warning: ccWarning,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Unexpected error creating PandaDoc IO",
      },
      { status: 500 }
    );
  }
}
