import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { addPlacement } from "@/lib/db";
import { getDefaultPlacementStatus } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    campaignId,
    type,
    publication,
    scheduledDate,
    scheduledEndDate,
    interviewScheduled,
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
    scheduledEndDate: scheduledEndDate || undefined,
    interviewScheduled: interviewScheduled ?? undefined,
    copyProducer: copyProducer || undefined,
    status: status || getDefaultPlacementStatus(type, publication),
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
