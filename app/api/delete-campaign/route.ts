import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { deleteCampaign } from "@/lib/db";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { campaignId } = body;

  if (!campaignId) {
    return NextResponse.json(
      { error: "campaignId is required" },
      { status: 400 }
    );
  }

  const deleted = await deleteCampaign(campaignId);
  if (!deleted) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  revalidatePath("/dashboard", "layout");
  return NextResponse.json({ success: true });
}
