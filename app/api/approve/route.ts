import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  getClientByPortalId,
  getCampaignById,
  getPlacement,
  updatePlacementStatus,
  updatePlacementCopy,
  updatePlacementLink,
} from "@/lib/db";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { campaignId, placementId, clientId, linkToPlacement } = body;

  if (!campaignId || !placementId || !clientId) {
    return NextResponse.json(
      { error: "campaignId, placementId, and clientId are required" },
      { status: 400 }
    );
  }

  if (!linkToPlacement) {
    return NextResponse.json(
      { error: "linkToPlacement is required" },
      { status: 400 }
    );
  }

  const client = await getClientByPortalId(clientId);
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const campaign = await getCampaignById(campaignId);
  if (!campaign) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  if (!client.campaignIds.includes(campaignId)) {
    return NextResponse.json(
      { error: "Campaign does not belong to this client" },
      { status: 403 }
    );
  }

  const placement = await getPlacement(campaignId, placementId);
  if (!placement) {
    return NextResponse.json(
      { error: "Placement not found" },
      { status: 404 }
    );
  }

  if (
    placement.status !== "Sent for Approval" &&
    placement.status !== "Peak Team Review Complete"
  ) {
    return NextResponse.json(
      { error: "Placement is not available for approval" },
      { status: 409 }
    );
  }

  // If client submitted edited copy, save it as a new version first
  const { editedCopy } = body;
  if (editedCopy && editedCopy !== placement.currentCopy) {
    const copyUpdated = await updatePlacementCopy(campaignId, placementId, editedCopy);
    if (!copyUpdated) {
      return NextResponse.json(
        { error: "Failed to save edited copy" },
        { status: 500 }
      );
    }
  }

  const updated = await updatePlacementStatus(campaignId, placementId, "Approved");
  if (!updated) {
    return NextResponse.json(
      { error: "Failed to update placement" },
      { status: 500 }
    );
  }

  await updatePlacementLink(campaignId, placementId, linkToPlacement);

  revalidatePath("/dashboard", "layout");
  return NextResponse.json({ success: true });
}
