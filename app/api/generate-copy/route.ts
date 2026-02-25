import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCampaignById, getClientByCampaignId, updatePlacementCopy, updatePlacementStatus, updateCampaignMetadata } from "@/lib/db";
import { generateCopyForPlacements } from "@/lib/ai";
import { isPodcastInterviewType, isPodcastPublication } from "@/lib/types";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { campaignId, roundId } = body;

  if (!campaignId) {
    return NextResponse.json(
      { error: "campaignId is required" },
      { status: 400 }
    );
  }

  const campaign = await getCampaignById(campaignId);
  if (!campaign) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  if (!campaign.onboardingMessaging || !campaign.onboardingDesiredAction) {
    return NextResponse.json(
      { error: "Campaign is missing onboarding data" },
      { status: 400 }
    );
  }

  const client = await getClientByCampaignId(campaignId);
  if (!client) {
    return NextResponse.json(
      { error: "Client not found" },
      { status: 404 }
    );
  }

  // Filter to placements that need copy, optionally scoped to a round
  const placementsWithBriefs = campaign.placements
    .filter((p) => {
      if (p.copyVersion > 0) return false;
      if (roundId && p.onboardingRoundId !== roundId) return false;
      return true;
    })
    .map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      publication: p.publication,
      brief: p.onboardingBrief || "",
      scheduledDate: p.scheduledDate,
    }));

  if (placementsWithBriefs.length === 0) {
    return NextResponse.json(
      { error: "No placements need copy generation" },
      { status: 400 }
    );
  }

  const results = await generateCopyForPlacements({
    campaignName: campaign.name,
    clientName: client.name,
    messaging: campaign.onboardingMessaging,
    desiredAction: campaign.onboardingDesiredAction,
    placements: placementsWithBriefs,
  });

  // Save generated copy to each placement
  for (const { placementId, copy } of results) {
    const placement = campaign.placements.find((p) => p.id === placementId);
    const nextStatus =
      placement && isPodcastPublication(placement.publication)
        ? isPodcastInterviewType(placement.type)
          ? "Drafting Questions"
          : "Drafting Script"
        : "Copywriting in Progress";
    await updatePlacementCopy(campaignId, placementId, copy);
    await updatePlacementStatus(campaignId, placementId, nextStatus);
  }

  // Check if all rounds are complete — if so, transition to Active
  const allRoundsComplete = campaign.onboardingRounds.every((r) => r.complete);
  if (allRoundsComplete || !roundId) {
    await updateCampaignMetadata(campaignId, { status: "Active" });
  }

  revalidatePath("/dashboard", "layout");
  revalidatePath("/portal", "layout");

  return NextResponse.json({
    success: true,
    generated: results.length,
  });
}
