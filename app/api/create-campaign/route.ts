import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createCampaign } from "@/lib/db";
import {
  CAMPAIGN_MANAGERS,
  isCampaignManager,
  isValidPlacementPublication,
} from "@/lib/types";
import { sendSlackNotification } from "@/lib/slack";
import { getAppBaseUrl } from "@/lib/urls";
import { buildCampaignCreatedNotification } from "@/lib/slack-events";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    clientName,
    name,
    category,
    salesPerson,
    campaignManager,
    currency,
    taxEligible,
    contactName,
    contactEmail,
    adLineItems,
    notes,
  } = body;

  if (!clientName || !name) {
    return NextResponse.json(
      { error: "clientName and name are required" },
      { status: 400 }
    );
  }

  if (!campaignManager || !isCampaignManager(campaignManager)) {
    return NextResponse.json(
      {
        error: `campaignManager is required and must be one of: ${CAMPAIGN_MANAGERS.join(", ")}`,
      },
      { status: 400 }
    );
  }

  if (Array.isArray(adLineItems)) {
    for (const item of adLineItems) {
      if (!item?.type || !item?.publication) {
        return NextResponse.json(
          { error: "Each ad line item must include type and publication" },
          { status: 400 }
        );
      }
      if (!isValidPlacementPublication(item.type, item.publication)) {
        return NextResponse.json(
          { error: `Invalid type/publication combination: ${item.type} + ${item.publication}` },
          { status: 400 }
        );
      }
    }
  }

  const campaign = await createCampaign({
    clientName,
    name,
    category,
    salesPerson,
    campaignManager,
    currency,
    taxEligible,
    contactName,
    contactEmail,
    adLineItems,
    notes,
  });

  const adLineItemsSummary =
    Array.isArray(campaign.adLineItems) && campaign.adLineItems.length > 0
      ? campaign.adLineItems
          .map((item) => `${item.quantity}x ${item.type} (${item.publication ?? "The Peak"})`)
          .join(", ")
      : "None";

  void sendSlackNotification(
    buildCampaignCreatedNotification({
      campaignId: campaign.id,
      campaignName: campaign.name,
      clientName,
      category: campaign.category,
      currency: campaign.currency,
      taxEligible: campaign.taxEligible,
      campaignManager: campaign.campaignManager,
      contactEmail: campaign.contactEmail,
      adLineItemsSummary,
      dashboardUrl: `${getAppBaseUrl()}/dashboard/${campaign.id}`,
    })
  ).catch((error: unknown) => {
    console.error("Slack notification failed (campaign.created):", error);
  });

  revalidatePath("/dashboard", "layout");
  return NextResponse.json({ success: true, campaignId: campaign.id });
}
