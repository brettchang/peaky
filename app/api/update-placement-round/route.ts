import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { updatePlacementOnboardingRound } from "@/lib/db";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { campaignId, placementId, onboardingRoundId } = body;

  if (!campaignId || !placementId) {
    return NextResponse.json(
      { error: "campaignId and placementId are required" },
      { status: 400 }
    );
  }

  const success = await updatePlacementOnboardingRound(
    campaignId,
    placementId,
    onboardingRoundId ?? null
  );

  if (!success) {
    return NextResponse.json(
      { error: "Placement not found" },
      { status: 404 }
    );
  }

  revalidatePath(`/dashboard/${campaignId}`);
  return NextResponse.json({ success: true });
}
