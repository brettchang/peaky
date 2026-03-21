import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { updateCampaignMetadata } from "@/lib/db";
import { CAMPAIGN_MANAGERS, isCampaignManager } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { campaignId, ...fields } = body;

  if (!campaignId) {
    return NextResponse.json(
      { error: "campaignId is required" },
      { status: 400 }
    );
  }

  if (
    fields.campaignManager !== undefined &&
    !isCampaignManager(fields.campaignManager)
  ) {
    return NextResponse.json(
      {
        error: `campaignManager must be one of: ${CAMPAIGN_MANAGERS.join(", ")}`,
      },
      { status: 400 }
    );
  }

  const updated = await updateCampaignMetadata(campaignId, fields);
  if (!updated) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  revalidatePath("/dashboard", "layout");
  revalidatePath(`/dashboard/${campaignId}`);
  return NextResponse.json({ success: true });
}
