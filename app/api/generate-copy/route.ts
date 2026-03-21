import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCampaignById, getClientByCampaignId, updatePlacementCopy, updatePlacementStatus, updateCampaignMetadata } from "@/lib/db";
import { generateCopyForPlacements } from "@/lib/ai";
import { isAiCopyGeneratableType, isPodcastInterviewType, isPodcastPublication } from "@/lib/types";

export const maxDuration = 60;

function hasCopyGenerationPendingStatus(status: string): boolean {
  return status === "Copywriting in Progress" || status === "Drafting Script";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { campaignId, roundId, placementId } = body;

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

    const campaignObjective = campaign.onboardingCampaignObjective?.trim() ?? "";
    const keyMessage = campaign.onboardingKeyMessage?.trim() ?? "";
    const talkingPoints = campaign.onboardingTalkingPoints?.trim() ?? "";
    const callToAction = campaign.onboardingCallToAction?.trim() ?? "";
    const targetAudience = campaign.onboardingTargetAudience?.trim() ?? "";
    const toneGuidelines = campaign.onboardingToneGuidelines?.trim() ?? "";

    const resolvedCampaignObjective =
      campaignObjective ||
      keyMessage ||
      talkingPoints ||
      "Drive qualified awareness and consideration for the advertiser's offer.";
    const resolvedKeyMessage =
      keyMessage ||
      campaignObjective ||
      talkingPoints ||
      "Focus on one clear customer benefit and why it matters now.";
    const resolvedTalkingPoints =
      talkingPoints ||
      keyMessage ||
      campaignObjective ||
      "Explain what it is, who it helps, and the practical outcome for the audience.";
    const resolvedCallToAction = callToAction || "Learn more";
    const resolvedTargetAudience = targetAudience || "General audience of the publication";
    const resolvedToneGuidelines = toneGuidelines || "Clear, compliant, and benefit-focused";

    const client = await getClientByCampaignId(campaignId);
    if (!client) {
      return NextResponse.json(
        { error: "Client not found" },
        { status: 404 }
      );
    }

    const requestedPlacementId =
      typeof placementId === "string" && placementId.trim()
        ? placementId.trim()
        : undefined;

    if (
      requestedPlacementId &&
      !campaign.placements.some((p) => p.id === requestedPlacementId)
    ) {
      return NextResponse.json(
        { error: "Placement not found in campaign" },
        { status: 404 }
      );
    }

    // Filter to placements that need copy, optionally scoped to a round or a specific placement
    const placementsNeedingCopy = campaign.placements
      .filter((p) => {
        if (requestedPlacementId) return p.id === requestedPlacementId;
        if (roundId && p.onboardingRoundId !== roundId) return false;
        // Round-scoped generation supports onboarding resubmissions even after prior drafts.
        if (roundId) return p.copyVersion === 0 || hasCopyGenerationPendingStatus(p.status);
        if (p.copyVersion > 0) return false;
        return true;
      });

    const skippedInterviewPlacements = placementsNeedingCopy.filter(
      (p) => !isAiCopyGeneratableType(p.type)
    );

    const placementsWithBriefs = placementsNeedingCopy
      .filter((p) => isAiCopyGeneratableType(p.type))
      .map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        publication: p.publication,
        brief: p.onboardingBrief || "",
        scheduledDate: p.scheduledDate,
      }));

    if (placementsWithBriefs.length === 0) {
      if (skippedInterviewPlacements.length > 0) {
        return NextResponse.json({
          success: true,
          generated: 0,
          skipped: skippedInterviewPlacements.length,
          skippedPlacementIds: skippedInterviewPlacements.map((p) => p.id),
          message:
            "Interview placements are not eligible for AI copy generation; only :30 podcast spots are generated automatically.",
        });
      }

      return NextResponse.json(
        { error: "No placements need copy generation" },
        { status: 400 }
      );
    }

    const results = await generateCopyForPlacements({
      campaignName: campaign.name,
      clientName: client.name,
      campaignObjective: resolvedCampaignObjective,
      keyMessage: resolvedKeyMessage,
      talkingPoints: resolvedTalkingPoints,
      callToAction: resolvedCallToAction,
      targetAudience: resolvedTargetAudience,
      toneGuidelines: resolvedToneGuidelines,
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
    if (allRoundsComplete || (!roundId && !requestedPlacementId)) {
      await updateCampaignMetadata(campaignId, { status: "Active" });
    }

    revalidatePath("/dashboard", "layout");
    revalidatePath("/portal", "layout");

    return NextResponse.json({
      success: true,
      generated: results.length,
      skipped: skippedInterviewPlacements.length,
      skippedPlacementIds: skippedInterviewPlacements.map((p) => p.id),
      ...(skippedInterviewPlacements.length > 0
        ? {
            message:
              "Interview placements were skipped because AI copy generation only supports :30 podcast spots and written ad copy placements.",
          }
        : {}),
    });
  } catch (error) {
    console.error("Failed to generate copy:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate copy",
      },
      { status: 500 }
    );
  }
}
