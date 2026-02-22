import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { addPlacement } from "@/lib/db";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    campaignId,
    type,
    publication,
    scheduledDate,
    copyProducer,
    status,
    notes,
    onboardingRoundId,
  } = body;

  if (!campaignId || !type || !publication) {
    return NextResponse.json(
      { error: "campaignId, type, and publication are required" },
      { status: 400 }
    );
  }

  const placement = await addPlacement(campaignId, {
    type,
    publication,
    scheduledDate: scheduledDate || undefined,
    copyProducer: copyProducer || undefined,
    status: status || "New Campaign",
    notes: notes || undefined,
    onboardingRoundId: onboardingRoundId || undefined,
  });

  if (!placement) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  revalidatePath("/dashboard", "layout");
  return NextResponse.json({ success: true, placementId: placement.id });
}
