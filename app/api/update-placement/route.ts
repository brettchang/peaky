import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { updatePlacementMetadata } from "@/lib/db";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { campaignId, placementId, ...fields } = body;

  if (!campaignId || !placementId) {
    return NextResponse.json(
      { error: "campaignId and placementId are required" },
      { status: 400 }
    );
  }

  for (const key of ["scheduledDate", "scheduledEndDate"] as const) {
    const value = fields[key];
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

  const updated = await updatePlacementMetadata(campaignId, placementId, fields);
  if (!updated) {
    return NextResponse.json(
      { error: "Placement not found" },
      { status: 404 }
    );
  }

  revalidatePath("/dashboard", "layout");
  return NextResponse.json({ success: true });
}
