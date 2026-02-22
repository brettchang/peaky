import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { updatePlacementCopy } from "@/lib/db";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { campaignId, placementId, copy } = body;

  if (!campaignId || !placementId || typeof copy !== "string") {
    return NextResponse.json(
      { error: "campaignId, placementId, and copy are required" },
      { status: 400 }
    );
  }

  const updated = await updatePlacementCopy(campaignId, placementId, copy);
  if (!updated) {
    return NextResponse.json(
      { error: "Placement not found" },
      { status: 404 }
    );
  }

  revalidatePath("/dashboard", "layout");
  return NextResponse.json({ success: true });
}
