import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getClientByPortalId, getCampaignById, saveOnboardingForm } from "@/lib/db";
import { isOnboardingEditable } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { campaignId, portalId, messaging, desiredAction, placementBriefs } = body;

    if (!campaignId || !portalId) {
      return NextResponse.json(
        { error: "campaignId and portalId are required" },
        { status: 400 }
      );
    }

    // Validate campaign belongs to portal
    const client = await getClientByPortalId(portalId);
    if (!client || !client.campaignIds.includes(campaignId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const campaign = await getCampaignById(campaignId);
    if (!campaign || !isOnboardingEditable(campaign)) {
      return NextResponse.json(
        { error: "Onboarding is no longer editable" },
        { status: 400 }
      );
    }

    await saveOnboardingForm(campaignId, {
      messaging,
      desiredAction,
      placementBriefs,
    });

    revalidatePath(`/portal/${portalId}/${campaignId}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save onboarding" },
      { status: 400 }
    );
  }
}
