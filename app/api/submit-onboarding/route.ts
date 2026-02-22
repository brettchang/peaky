import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getClientByPortalId, getCampaignById, submitOnboardingForm } from "@/lib/db";
import { isOnboardingEditable } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { campaignId, portalId, messaging, desiredAction, placementBriefs } = body;

  if (!campaignId || !portalId) {
    return NextResponse.json(
      { error: "campaignId and portalId are required" },
      { status: 400 }
    );
  }

  if (!messaging || !desiredAction) {
    return NextResponse.json(
      { error: "messaging and desiredAction are required" },
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

  await submitOnboardingForm(campaignId, {
    messaging,
    desiredAction,
    placementBriefs: placementBriefs || [],
  });

  // Fire-and-forget: trigger AI copy generation
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  fetch(`${baseUrl}/api/generate-copy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ campaignId }),
  }).catch(() => {
    // AI generation is best-effort; don't block the response
  });

  revalidatePath(`/portal/${portalId}/${campaignId}`);
  revalidatePath("/dashboard", "layout");
  return NextResponse.json({ success: true });
}
