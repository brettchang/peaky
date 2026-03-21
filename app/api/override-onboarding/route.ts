import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { DASHBOARD_COOKIE_NAME, isDashboardAuthenticated } from "@/lib/dashboard-auth";
import {
  db,
  getSetting,
  markOnboardingComplete,
  upsertSetting,
} from "@/lib/db";
import * as schema from "@/lib/db/schema";
import {
  onboardingOverridesSettingKey,
  parseCampaignOnboardingOverrides,
  serializeCampaignOnboardingOverrides,
} from "@/lib/onboarding-overrides";

export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(DASHBOARD_COOKIE_NAME);
  if (!(await isDashboardAuthenticated(cookie?.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const campaignId =
    typeof body?.campaignId === "string" ? body.campaignId.trim() : "";
  const type = body?.type === "billing" ? "billing" : body?.type === "round" ? "round" : "";
  const action = body?.action === "remove" ? "remove" : "override";
  const roundId = typeof body?.roundId === "string" ? body.roundId.trim() : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

  if (!campaignId || !type) {
    return NextResponse.json(
      { error: "campaignId and type are required" },
      { status: 400 }
    );
  }

  if (type === "round" && !roundId) {
    return NextResponse.json(
      { error: "roundId is required for round overrides" },
      { status: 400 }
    );
  }

  if (action === "override" && !reason) {
    return NextResponse.json(
      { error: "reason is required when overriding" },
      { status: 400 }
    );
  }

  const key = onboardingOverridesSettingKey(campaignId);
  const existing = parseCampaignOnboardingOverrides(await getSetting(key));

  let updated = false;
  if (action === "override") {
    if (type === "round") {
      updated = await markOnboardingComplete(campaignId, roundId);
    } else {
      const result = await db
        .update(schema.billingOnboarding)
        .set({
          complete: true,
          completedAt: new Date(),
        })
        .where(eq(schema.billingOnboarding.campaignId, campaignId));
      updated = (result.rowCount ?? 0) > 0;
    }

    if (!updated) {
      return NextResponse.json(
        { error: "Campaign/round not found or already complete" },
        { status: 404 }
      );
    }

    const entry = {
      reason,
      overriddenAt: new Date().toISOString(),
    };
    if (type === "round") {
      existing.rounds[roundId] = entry;
    } else {
      existing.billing = entry;
    }
  } else {
    const hasOverride =
      type === "round" ? Boolean(existing.rounds[roundId]) : Boolean(existing.billing);
    if (!hasOverride) {
      return NextResponse.json(
        { error: "No override found to remove" },
        { status: 404 }
      );
    }

    if (type === "round") {
      const result = await db
        .update(schema.onboardingRounds)
        .set({ complete: false })
        .where(
          and(
            eq(schema.onboardingRounds.id, roundId),
            eq(schema.onboardingRounds.campaignId, campaignId)
          )
        );
      updated = (result.rowCount ?? 0) > 0;
    } else {
      const result = await db
        .update(schema.billingOnboarding)
        .set({
          complete: false,
          completedAt: null,
        })
        .where(eq(schema.billingOnboarding.campaignId, campaignId));
      updated = (result.rowCount ?? 0) > 0;
    }

    if (!updated) {
      return NextResponse.json(
        { error: "Campaign/round not found" },
        { status: 404 }
      );
    }

    if (type === "round") {
      delete existing.rounds[roundId];
    } else {
      delete existing.billing;
    }

    const campaign = await db.query.campaigns.findFirst({
      where: eq(schema.campaigns.id, campaignId),
      with: { onboardingRounds: true },
    });
    if (
      campaign &&
      campaign.status === "Active" &&
      !campaign.onboardingSubmittedAt &&
      campaign.onboardingRounds.every((r) => !r.complete)
    ) {
      await db
        .update(schema.campaigns)
        .set({ status: "Waiting for onboarding" })
        .where(eq(schema.campaigns.id, campaignId));
    }
  }

  await upsertSetting(key, serializeCampaignOnboardingOverrides(existing));

  const campaignForRevalidation = await db.query.campaigns.findFirst({
    where: eq(schema.campaigns.id, campaignId),
  });
  const portalId = campaignForRevalidation?.portalId;

  if (portalId) {
    revalidatePath(`/portal/${portalId}`);
    revalidatePath(`/portal/${portalId}/${campaignId}`);
    if (type === "round" && roundId) {
      revalidatePath(`/portal/${portalId}/${campaignId}/form/${roundId}`);
    }
  }

  revalidatePath("/dashboard", "layout");
  revalidatePath(`/dashboard/${campaignId}`);
  return NextResponse.json({ success: true });
}
