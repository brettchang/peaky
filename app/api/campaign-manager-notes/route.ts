import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { addCampaignManagerNote } from "@/lib/db";
import type { CampaignManager } from "@/lib/types";
import { isCampaignManager } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    campaignId?: string;
    note?: string;
    authorName?: string;
  };

  const campaignId = body.campaignId?.trim();
  const note = body.note?.trim();
  const authorNameRaw = body.authorName?.trim();

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
  }

  if (!note) {
    return NextResponse.json({ error: "note is required" }, { status: 400 });
  }

  if (authorNameRaw && !isCampaignManager(authorNameRaw)) {
    return NextResponse.json({ error: "Invalid campaign manager" }, { status: 400 });
  }
  const authorName: CampaignManager | undefined =
    authorNameRaw && isCampaignManager(authorNameRaw) ? authorNameRaw : undefined;

  try {
    const created = await addCampaignManagerNote(campaignId, note, authorName);
    if (!created) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save note";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  revalidatePath("/dashboard", "layout");
  revalidatePath(`/dashboard/${campaignId}`);

  return NextResponse.json({ success: true });
}
