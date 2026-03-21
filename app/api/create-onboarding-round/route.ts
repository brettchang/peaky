import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createOnboardingRound } from "@/lib/db";
import type { OnboardingFormType } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { campaignId, label, formType } = body;

  if (!campaignId) {
    return NextResponse.json(
      { error: "campaignId is required" },
      { status: 400 }
    );
  }

  if (formType && formType !== "newsletter" && formType !== "podcast") {
    return NextResponse.json(
      { error: "formType must be 'newsletter' or 'podcast'" },
      { status: 400 }
    );
  }

  const round = await createOnboardingRound(
    campaignId,
    label || undefined,
    (formType as OnboardingFormType | undefined) ?? "newsletter"
  );
  if (!round) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  revalidatePath("/dashboard", "layout");
  return NextResponse.json({ success: true, roundId: round.id });
}
