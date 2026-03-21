import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getClientByPortalId, getCampaignById, saveOnboardingForm } from "@/lib/db";
import { isDashboardRequestAuthenticated } from "@/lib/dashboard-auth";
import { isOnboardingEditable } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      campaignId,
      portalId,
      campaignObjective,
      keyMessage,
      talkingPoints,
      callToAction,
      targetAudience,
      toneGuidelines,
      placementBriefs,
      admin,
    } = body;
    const isAdmin = admin === true;

    if (!campaignId || !portalId) {
      return NextResponse.json(
        { error: "campaignId and portalId are required" },
        { status: 400 }
      );
    }

    // Validate campaign belongs to portal
    if (isAdmin) {
      if (!(await isDashboardRequestAuthenticated(request))) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } else {
      const client = await getClientByPortalId(portalId);
      if (!client || !client.campaignIds.includes(campaignId)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }

    const campaign = await getCampaignById(campaignId);
    if (!campaign || (!isAdmin && !isOnboardingEditable(campaign))) {
      return NextResponse.json(
        { error: "Onboarding is no longer editable" },
        { status: 400 }
      );
    }

    await saveOnboardingForm(campaignId, {
      campaignObjective,
      keyMessage,
      talkingPoints,
      callToAction,
      targetAudience,
      toneGuidelines,
      placementBriefs,
    });

    revalidatePath(`/portal/${portalId}/${campaignId}`);
    revalidatePath(`/dashboard/${campaignId}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save onboarding" },
      { status: 400 }
    );
  }
}
