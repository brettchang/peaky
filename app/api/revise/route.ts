import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  getClientByPortalId,
  getCampaignById,
  getPlacement,
  savePlacementRevisionNotes,
} from "@/lib/db";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { campaignId, placementId, clientId, notes } = body;

  if (!campaignId || !placementId || !clientId) {
    return NextResponse.json(
      { error: "campaignId, placementId, and clientId are required" },
      { status: 400 }
    );
  }

  if (!notes || !notes.trim()) {
    return NextResponse.json(
      { error: "Revision notes are required" },
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
      { error: "Placement is not available for revisions" },
      { status: 409 }
    );
  }

  const updated = await savePlacementRevisionNotes(campaignId, placementId, notes.trim());
  if (!updated) {
    return NextResponse.json(
      { error: "Failed to save revision notes" },
      { status: 500 }
    );
  }

  revalidatePath("/dashboard", "layout");
  return NextResponse.json({ success: true });
}
