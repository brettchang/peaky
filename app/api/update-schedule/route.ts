import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCampaignById, getPlacement, updatePlacementScheduledDate } from "@/lib/db";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { campaignId, placementId, scheduledDate } = body;

  if (!campaignId || !placementId) {
    return NextResponse.json(
      { error: "campaignId and placementId are required" },
      { status: 400 }
    );
  }

  // Validate date format if provided
  if (scheduledDate !== null && scheduledDate !== undefined) {
    if (typeof scheduledDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
      return NextResponse.json(
        { error: "scheduledDate must be in YYYY-MM-DD format or null" },
        { status: 400 }
      );
    }
  }

  const campaign = await getCampaignById(campaignId);
  if (!campaign) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  const placement = await getPlacement(campaignId, placementId);
  if (!placement) {
    return NextResponse.json(
      { error: "Placement not found" },
      { status: 404 }
    );
  }

  const success = await updatePlacementScheduledDate(
    campaignId,
    placementId,
    scheduledDate ?? null
  );

  if (!success) {
    return NextResponse.json(
      { error: "Failed to update scheduled date" },
      { status: 500 }
    );
  }

  revalidatePath("/dashboard", "layout");
  return NextResponse.json({ success: true });
}
