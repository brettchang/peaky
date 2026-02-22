import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { markOnboardingComplete } from "@/lib/db/mutations";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const campaignId = formData.get("campaignId") as string | null;
  const type = formData.get("type") as string | null;
  const roundId = formData.get("roundId") as string | null;

  if (!file || !campaignId || !type) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  if (type === "round" && !roundId) {
    return NextResponse.json(
      { error: "roundId is required for type=round" },
      { status: 400 }
    );
  }

  // Upload to Vercel Blob
  const pathname = `onboarding/${campaignId}/${Date.now()}-${file.name}`;
  const blob = await put(pathname, file, { access: "public" });

  if (type === "round") {
    // Set the onboardingDocUrl on the round
    await db
      .update(schema.onboardingRounds)
      .set({ onboardingDocUrl: blob.url })
      .where(eq(schema.onboardingRounds.id, roundId!));

    // Use existing function which handles campaign status transition
    await markOnboardingComplete(campaignId, roundId!);
  } else if (type === "billing") {
    // Direct update — avoids nulling out existing billing fields
    await db
      .update(schema.billingOnboarding)
      .set({
        complete: true,
        completedAt: new Date(),
        uploadedDocUrl: blob.url,
      })
      .where(eq(schema.billingOnboarding.campaignId, campaignId));
  } else {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  revalidatePath("/dashboard", "layout");

  return NextResponse.json({ url: blob.url });
}
