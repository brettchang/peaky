import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { markOnboardingComplete, markBillingOnboardingComplete } from "@/lib/db";
import { InvoiceCadence } from "@/lib/types";

interface FilloutQuestion {
  key?: string;
  value?: string | number;
}

function extractBillingFields(questions: FilloutQuestion[]): {
  billingContactName?: string;
  billingContactEmail?: string;
  billingAddress?: string;
  poNumber?: string;
  invoiceCadence?: InvoiceCadence;
  specialInstructions?: string;
} {
  function getField(key: string): string | undefined {
    const q = questions.find((q) => q.key === key);
    return q?.value != null ? String(q.value) : undefined;
  }

  function getNumberField(key: string): number | undefined {
    const q = questions.find((q) => q.key === key);
    if (q?.value == null) return undefined;
    const n = Number(q.value);
    return isNaN(n) ? undefined : n;
  }

  const cadenceType = getField("invoice_cadence");
  let invoiceCadence: InvoiceCadence | undefined;

  if (cadenceType === "lump-sum") {
    invoiceCadence = {
      type: "lump-sum",
      totalAmount: getNumberField("total_amount") ?? 0,
      paymentTerms: getField("payment_terms") ?? "net-30",
    };
  } else if (cadenceType === "equal-monthly") {
    const totalAmount = getNumberField("total_amount") ?? 0;
    const numberOfMonths = getNumberField("number_of_months") ?? 1;
    invoiceCadence = {
      type: "equal-monthly",
      totalAmount,
      numberOfMonths,
      monthlyAmount: numberOfMonths > 0 ? totalAmount / numberOfMonths : totalAmount,
    };
  } else if (cadenceType === "per-month-usage") {
    invoiceCadence = { type: "per-month-usage" };
  }

  return {
    billingContactName: getField("billing_contact_name"),
    billingContactEmail: getField("billing_contact_email"),
    billingAddress: getField("billing_address"),
    poNumber: getField("po_number"),
    invoiceCadence,
    specialInstructions: getField("special_instructions"),
  };
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Fillout sends form submissions with a `questions` array containing URL parameters.
  // The campaign_id and round_id are passed as URL parameters on the form link.
  // Fillout webhook payload structure: { questions: [...], urlParameters: [...] }
  let campaignId: string | undefined;
  let roundId: string | undefined;
  let formType: string | undefined;

  // Check urlParameters array (Fillout's standard format)
  if (Array.isArray(body.urlParameters)) {
    const campaignParam = body.urlParameters.find(
      (p: { key?: string; value?: string }) => p.key === "campaign_id"
    );
    if (campaignParam?.value) campaignId = campaignParam.value;

    const roundParam = body.urlParameters.find(
      (p: { key?: string; value?: string }) => p.key === "round_id"
    );
    if (roundParam?.value) roundId = roundParam.value;

    const formTypeParam = body.urlParameters.find(
      (p: { key?: string; value?: string }) => p.key === "form_type"
    );
    if (formTypeParam?.value) formType = formTypeParam.value;
  }

  // Fallback: check top-level fields
  if (!campaignId && body.campaign_id) {
    campaignId = body.campaign_id;
  }
  if (!roundId && body.round_id) {
    roundId = body.round_id;
  }
  if (!formType && body.form_type) {
    formType = body.form_type;
  }

  if (!campaignId) {
    return NextResponse.json(
      { error: "campaign_id not found in submission" },
      { status: 400 }
    );
  }

  if (formType === "billing") {
    // Handle billing onboarding form
    const questions: FilloutQuestion[] = Array.isArray(body.questions)
      ? body.questions
      : [];
    const billingData = extractBillingFields(questions);
    const updated = await markBillingOnboardingComplete(campaignId, billingData);
    if (!updated) {
      return NextResponse.json(
        { error: "Campaign not found or no billing onboarding" },
        { status: 404 }
      );
    }
  } else {
    // Handle copy onboarding form (existing behavior)
    const updated = await markOnboardingComplete(campaignId, roundId);
    if (!updated) {
      return NextResponse.json(
        { error: "Campaign or round not found" },
        { status: 404 }
      );
    }
  }

  revalidatePath("/dashboard", "layout");
  return NextResponse.json({ success: true });
}
