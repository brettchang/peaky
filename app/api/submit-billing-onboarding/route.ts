import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getClientByPortalId, getCampaignById, submitBillingOnboardingForm } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      campaignId,
      portalId,
      primaryContactName,
      primaryContactEmail,
      representingClient,
      wantsPeakCopy,
      companyName,
      billingAddress,
      billingContactName,
      billingContactEmail,
      specificInvoicingInstructions,
    } = body;

    if (!campaignId || !portalId) {
      return NextResponse.json(
        { error: "campaignId and portalId are required" },
        { status: 400 }
      );
    }

    const missing = [
      !primaryContactName && "primaryContactName",
      !primaryContactEmail && "primaryContactEmail",
      companyName === undefined || companyName === "" ? "companyName" : false,
      !billingAddress && "billingAddress",
      !billingContactName && "billingContactName",
      !billingContactEmail && "billingContactEmail",
    ].filter(Boolean);

    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    const client = await getClientByPortalId(portalId);
    if (!client || !client.campaignIds.includes(campaignId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const campaign = await getCampaignById(campaignId);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (campaign.billingOnboarding?.complete) {
      return NextResponse.json(
        { error: "Billing onboarding has already been submitted" },
        { status: 400 }
      );
    }

    const ok = await submitBillingOnboardingForm(campaignId, {
      primaryContactName,
      primaryContactEmail,
      representingClient: !!representingClient,
      wantsPeakCopy: !!wantsPeakCopy,
      companyName,
      billingAddress,
      billingContactName,
      billingContactEmail,
      specificInvoicingInstructions,
    });

    if (!ok) {
      return NextResponse.json(
        { error: "Failed to submit billing onboarding" },
        { status: 400 }
      );
    }

    revalidatePath(`/portal/${portalId}/${campaignId}`);
    revalidatePath(`/portal/${portalId}`);
    revalidatePath(`/dashboard/${campaignId}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit billing onboarding" },
      { status: 400 }
    );
  }
}

