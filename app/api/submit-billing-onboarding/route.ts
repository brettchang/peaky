import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getClientByPortalId, getCampaignById, submitBillingOnboardingForm } from "@/lib/db";
import { sendSlackNotification } from "@/lib/slack";
import { getAppBaseUrl } from "@/lib/urls";
import { buildBillingSubmittedNotification } from "@/lib/slack-events";

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
      ioSigningContactName,
      ioSigningContactEmail,
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
      !ioSigningContactName && "ioSigningContactName",
      !ioSigningContactEmail && "ioSigningContactEmail",
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
    if (campaign.complementaryCampaign) {
      return NextResponse.json(
        {
          error:
            "Campaign is marked as complementary and does not require billing onboarding.",
        },
        { status: 400 }
      );
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
      ioSigningContactName,
      ioSigningContactEmail,
      specificInvoicingInstructions,
    });

    if (!ok) {
      return NextResponse.json(
        { error: "Failed to submit billing onboarding" },
        { status: 400 }
      );
    }

    void sendSlackNotification(
      buildBillingSubmittedNotification({
        campaignId,
        campaignName: campaign.name,
        portalId,
        billingCompany: companyName,
        billingContactName,
        billingContactEmail,
        ioSigningContactName,
        ioSigningContactEmail,
        submittedAtIso: new Date().toISOString(),
        dashboardUrl: `${getAppBaseUrl()}/dashboard/${campaignId}`,
      })
    ).catch((error: unknown) => {
      console.error("Slack notification failed (billing.submitted):", error);
    });

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
