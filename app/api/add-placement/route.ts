import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { addPlacement } from "@/lib/db";
import { getDefaultPlacementStatus, isValidPlacementPublication } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    campaignId,
    type,
    publication,
    scheduledDate,
    scheduledEndDate,
    historicalDateOverride,
    interviewScheduled,
    committedImpressions,
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

  if (!isValidPlacementPublication(type, publication)) {
    return NextResponse.json(
      { error: `Invalid type/publication combination: ${type} + ${publication}` },
      { status: 400 }
    );
  }

  for (const [key, value] of [
    ["scheduledDate", scheduledDate],
    ["scheduledEndDate", scheduledEndDate],
  ] as const) {
    if (
      value !== undefined &&
      value !== null &&
      (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    ) {
      return NextResponse.json(
        { error: `${key} must be YYYY-MM-DD, null, or omitted` },
        { status: 400 }
      );
    }
  }

  if (
    historicalDateOverride !== undefined &&
    historicalDateOverride !== null &&
    typeof historicalDateOverride !== "boolean"
  ) {
    return NextResponse.json(
      { error: "historicalDateOverride must be a boolean when provided" },
      { status: 400 }
    );
  }

  if (
    committedImpressions !== undefined &&
    committedImpressions !== null &&
    (!Number.isFinite(committedImpressions) ||
      committedImpressions < 0 ||
      !Number.isInteger(committedImpressions))
  ) {
    return NextResponse.json(
      { error: "committedImpressions must be a non-negative integer" },
      { status: 400 }
    );
  }

  const placement = await addPlacement(campaignId, {
    type,
    publication,
    scheduledDate: scheduledDate || undefined,
    scheduledEndDate: scheduledEndDate || undefined,
    historicalDateOverride: historicalDateOverride === true,
    interviewScheduled: interviewScheduled ?? undefined,
    committedImpressions: committedImpressions ?? undefined,
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
