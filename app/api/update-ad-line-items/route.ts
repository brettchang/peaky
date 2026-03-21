import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { updateAdLineItems } from "@/lib/db";
import { isValidPlacementPublication } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { campaignId, adLineItems } = body;

  if (!campaignId || !Array.isArray(adLineItems)) {
    return NextResponse.json(
      { error: "campaignId and adLineItems are required" },
      { status: 400 }
    );
  }

  for (const item of adLineItems) {
    if (!item?.type || !item?.publication) {
      return NextResponse.json(
        { error: "Each ad line item must include type and publication" },
        { status: 400 }
      );
    }
    if (!isValidPlacementPublication(item.type, item.publication)) {
      return NextResponse.json(
        { error: `Invalid type/publication combination: ${item.type} + ${item.publication}` },
        { status: 400 }
      );
    }
  }

  const updated = await updateAdLineItems(campaignId, adLineItems);
  if (!updated) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  revalidatePath("/dashboard", "layout");
  return NextResponse.json({ success: true });
}
