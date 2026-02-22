import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createOnboardingRound } from "@/lib/db";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { campaignId, label } = body;

  if (!campaignId) {
    return NextResponse.json(
      { error: "campaignId is required" },
      { status: 400 }
    );
  }

  const round = await createOnboardingRound(campaignId, label || undefined);
  if (!round) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  revalidatePath("/dashboard", "layout");
  return NextResponse.json({ success: true, roundId: round.id });
}
