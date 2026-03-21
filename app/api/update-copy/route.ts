import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isDashboardRequestAuthenticated } from "@/lib/dashboard-auth";
import {
  getCampaignById,
  getClientByPortalId,
  getPlacement,
  updatePlacementCopy,
} from "@/lib/db";
import { canClientEditApprovedPlacementCopy } from "@/lib/placement-editability";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { campaignId, placementId, copy, clientId } = body;

  if (!campaignId || !placementId || typeof copy !== "string") {
    return NextResponse.json(
      { error: "campaignId, placementId, and copy are required" },
      { status: 400 }
    );
  }

  if (clientId) {
    const client = await getClientByPortalId(clientId);
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const campaign = await getCampaignById(campaignId);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
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

    if (!canClientEditApprovedPlacementCopy(placement)) {
      return NextResponse.json(
        {
          error:
            "This placement can no longer be edited. Client edits close 12 hours before the 6:00 AM Eastern run time.",
        },
        { status: 409 }
      );
    }
  } else if (!(await isDashboardRequestAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const updated = await updatePlacementCopy(campaignId, placementId, copy);
  if (!updated) {
    return NextResponse.json(
      { error: "Placement not found" },
      { status: 404 }
    );
  }

  revalidatePath("/dashboard", "layout");
  revalidatePath("/portal", "layout");
  return NextResponse.json({ success: true });
}
