import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
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
  if (!isDashboardAuthenticated(cookie?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const campaignId =
    typeof body?.campaignId === "string" ? body.campaignId.trim() : "";
  const type = body?.type === "billing" ? "billing" : body?.type === "round" ? "round" : "";
  const roundId = typeof body?.roundId === "string" ? body.roundId.trim() : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

  if (!campaignId || !type || !reason) {
    return NextResponse.json(
      { error: "campaignId, type, and reason are required" },
      { status: 400 }
    );
  }

  if (type === "round" && !roundId) {
    return NextResponse.json(
      { error: "roundId is required for round overrides" },
      { status: 400 }
    );
  }

  let updated = false;
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

  const key = onboardingOverridesSettingKey(campaignId);
  const existing = parseCampaignOnboardingOverrides(await getSetting(key));
  const entry = {
    reason,
    overriddenAt: new Date().toISOString(),
  };
  if (type === "round") {
    existing.rounds[roundId] = entry;
  } else {
    existing.billing = entry;
  }
  await upsertSetting(key, serializeCampaignOnboardingOverrides(existing));

  revalidatePath("/dashboard", "layout");
  revalidatePath(`/dashboard/${campaignId}`);
  return NextResponse.json({ success: true });
}
