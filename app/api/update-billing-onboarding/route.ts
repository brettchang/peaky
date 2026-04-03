import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { DASHBOARD_COOKIE_NAME, isDashboardAuthenticated } from "@/lib/dashboard-auth";
import { getCampaignById, updateBillingOnboardingByAdmin } from "@/lib/db";
import type { InvoiceCadence } from "@/lib/types";

interface UpdateBillingPayload {
  campaignId: string;
  companyName?: string;
  representingClient?: boolean;
  wantsPeakCopy?: boolean;
  billingContactName?: string;
  billingContactEmail?: string;
  ioSigningContactName?: string;
  ioSigningContactEmail?: string;
  billingAddress?: string;
  invoiceCadence?: InvoiceCadence;
  specialInstructions?: string;
}

export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(DASHBOARD_COOKIE_NAME);
  if (!(await isDashboardAuthenticated(cookie?.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as UpdateBillingPayload;

  if (!body.campaignId) {
    return NextResponse.json(
      { error: "campaignId is required" },
      { status: 400 }
    );
  }

  const updated = await updateBillingOnboardingByAdmin(body.campaignId, {
    poNumber: body.companyName,
    representingClient: body.representingClient,
    wantsPeakCopy: body.wantsPeakCopy,
    billingContactName: body.billingContactName,
    billingContactEmail: body.billingContactEmail,
    ioSigningContactName: body.ioSigningContactName,
    ioSigningContactEmail: body.ioSigningContactEmail,
    billingAddress: body.billingAddress,
    invoiceCadence: body.invoiceCadence,
    specialInstructions: body.specialInstructions,
  });

  if (!updated) {
    return NextResponse.json(
      { error: "Campaign billing onboarding not found" },
      { status: 404 }
    );
  }

  revalidatePath("/dashboard", "layout");
  revalidatePath(`/dashboard/${body.campaignId}`);
  const campaign = await getCampaignById(body.campaignId);
  if (campaign?.portalId) {
    revalidatePath(`/portal/${campaign.portalId}`);
    revalidatePath(`/portal/${campaign.portalId}/${body.campaignId}`);
  }

  return NextResponse.json({ success: true });
}
