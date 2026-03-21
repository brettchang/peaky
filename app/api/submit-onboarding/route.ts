import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getClientByPortalId, getCampaignById, submitOnboardingForm } from "@/lib/db";
import { isDashboardRequestAuthenticated } from "@/lib/dashboard-auth";
import { isOnboardingEditable } from "@/lib/types";
import { sendSlackNotification } from "@/lib/slack";
import { getPortalBaseUrl } from "@/lib/urls";
import { buildOnboardingSubmittedNotification } from "@/lib/slack-events";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      campaignId,
      portalId,
      roundId,
      placementIds,
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

    const missing = [
      !campaignId && "campaignId",
      !portalId && "portalId",
      !roundId && "roundId",
    ].filter(Boolean);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
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

    const round = campaign.onboardingRounds.find((entry) => entry.id === roundId);
    if (!round) {
      return NextResponse.json({ error: "Onboarding round not found" }, { status: 400 });
    }

    const billingMeta = extractBillingMeta(campaign.notes);
    const clientProvidesCopy = billingMeta.wantsPeakCopy === false;

    const hasText = (value: unknown) =>
      typeof value === "string" && value.trim().length > 0;
    const requiredFields =
      clientProvidesCopy
        ? []
        : round.formType === "podcast"
        ? [
            ["campaignObjective", campaignObjective],
            ["keyMessage", keyMessage],
            ["talkingPoints", talkingPoints],
            ["callToAction", callToAction],
            ["targetAudience", targetAudience],
            ["toneGuidelines", toneGuidelines],
          ]
        : [
            ["campaignObjective", campaignObjective],
            ["callToAction", callToAction],
          ];
    const missingOnboardingFields = requiredFields
      .filter(([, value]) => !hasText(value))
      .map(([name]) => name);
    if (missingOnboardingFields.length > 0) {
      return NextResponse.json(
        { error: `Missing required onboarding fields: ${missingOnboardingFields.join(", ")}` },
        { status: 400 }
      );
    }

    if (clientProvidesCopy) {
      const incompletePlacements = (placementBriefs || []).filter((placement: {
        placementId: string;
        copy?: string;
        link?: string;
        imageUrl?: string;
        logoUrl?: string;
      }) => {
        const needsLink = round.formType !== "podcast";
        const needsPrimaryAssets =
          campaign.placements.find((row) => row.id === placement.placementId)?.type === "Primary";
        return (
          !hasText(placement.copy) ||
          (needsLink && !hasText(placement.link)) ||
          (needsPrimaryAssets &&
            (!hasText(placement.imageUrl) || !hasText(placement.logoUrl)))
        );
      });
      if (incompletePlacements.length > 0) {
        return NextResponse.json(
          {
            error:
              "Client-produced copy forms require final copy for every placement, links for newsletter placements, and logo/image assets for Primary placements.",
          },
          { status: 400 }
        );
      }
    }

    await submitOnboardingForm(campaignId, roundId, {
      campaignObjective,
      keyMessage,
      talkingPoints,
      callToAction,
      targetAudience,
      toneGuidelines,
      placementIds: placementIds || [],
      placementBriefs: placementBriefs || [],
    });

    if (!isAdmin) {
      void sendSlackNotification(
        buildOnboardingSubmittedNotification({
          campaignId,
          campaignName: campaign.name,
          portalId,
          roundId,
          placementsCount: placementIds?.length ?? placementBriefs?.length ?? 0,
          submittedAtIso: new Date().toISOString(),
          dashboardUrl: `${getPortalBaseUrl()}/portal/${portalId}/${campaignId}`,
        })
      ).catch((error: unknown) => {
        console.error("Slack notification failed (onboarding.submitted):", error);
      });
    }

    // Fire-and-forget: trigger AI copy generation for this round
    if (!clientProvidesCopy) {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
      fetch(`${baseUrl}/api/generate-copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, roundId }),
      }).catch(() => {
        // AI generation is best-effort; don't block the response
      });
    }

    revalidatePath(`/portal/${portalId}/${campaignId}`);
    revalidatePath("/dashboard", "layout");
    revalidatePath(`/dashboard/${campaignId}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit onboarding" },
      { status: 400 }
    );
  }
}

function extractBillingMeta(notes?: string): {
  wantsPeakCopy?: boolean;
} {
  if (!notes) return {};
  const start = notes.indexOf("<!-- billing-meta:start -->");
  const end = notes.indexOf("<!-- billing-meta:end -->");
  if (start === -1 || end === -1 || end < start) return {};

  const raw = notes
    .slice(start + "<!-- billing-meta:start -->".length, end)
    .trim();
  try {
    return JSON.parse(raw) as {
      wantsPeakCopy?: boolean;
    };
  } catch {
    return {};
  }
}
