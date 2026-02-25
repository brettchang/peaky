import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createCampaign } from "@/lib/db";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    clientName,
    name,
    salesPerson,
    campaignManager,
    contactName,
    contactEmail,
    adLineItems,
    notes,
  } = body;

  if (!clientName || !name) {
    return NextResponse.json(
      { error: "clientName and name are required" },
      { status: 400 }
    );
  }

  const campaign = await createCampaign({
    clientName,
    name,
    salesPerson,
    campaignManager,
    contactName,
    contactEmail,
    adLineItems,
    notes,
  });

  revalidatePath("/dashboard", "layout");
  return NextResponse.json({ success: true, campaignId: campaign.id });
}
