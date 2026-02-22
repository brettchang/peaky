import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCampaignById, getPlacement, publishPlacementToBeehiiv } from "@/lib/db";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { campaignId, placementId } = body;

  if (!campaignId || !placementId) {
    return NextResponse.json(
      { error: "campaignId and placementId are required" },
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

  const placement = await getPlacement(campaignId, placementId);
  if (!placement) {
    return NextResponse.json(
      { error: "Placement not found" },
      { status: 404 }
    );
  }

  if (placement.status !== "Approved") {
    return NextResponse.json(
      { error: "Only approved placements can be published" },
      { status: 409 }
    );
  }

  const result = await publishPlacementToBeehiiv(campaignId, placementId);
  if (!result) {
    return NextResponse.json(
      { error: "Failed to publish placement" },
      { status: 500 }
    );
  }

  revalidatePath("/dashboard", "layout");
  return NextResponse.json({
    success: true,
    beehiivPostId: result.beehiivPostId,
  });
}
