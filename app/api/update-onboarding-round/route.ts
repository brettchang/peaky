import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { updateOnboardingRoundLabel } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { campaignId, roundId, label } = body as {
      campaignId?: string;
      roundId?: string;
      label?: string;
    };

    if (!campaignId || !roundId) {
      return NextResponse.json(
        { error: "campaignId and roundId are required" },
        { status: 400 }
      );
    }

    const success = await updateOnboardingRoundLabel(campaignId, roundId, label);
    if (!success) {
      return NextResponse.json(
        { error: "Onboarding round not found" },
        { status: 404 }
      );
    }

    revalidatePath(`/dashboard/${campaignId}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update onboarding round" },
      { status: 400 }
    );
  }
}
