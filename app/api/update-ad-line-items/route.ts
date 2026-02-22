import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { updateAdLineItems } from "@/lib/db";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { campaignId, adLineItems } = body;

  if (!campaignId || !Array.isArray(adLineItems)) {
    return NextResponse.json(
      { error: "campaignId and adLineItems are required" },
      { status: 400 }
    );
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
