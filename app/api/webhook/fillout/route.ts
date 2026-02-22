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

  // Log the full payload to diagnose Fillout's format
  console.log("Fillout webhook payload:", JSON.stringify(body, null, 2));

  // Helper: search an array of {key, value} or {name, value} or {id, value} objects
  function findInArray(arr: unknown[], key: string): string | undefined {
    if (!Array.isArray(arr)) return undefined;
    for (const item of arr) {
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        // Match by key, name, or id
        if (
          (obj.key === key || obj.name === key || obj.id === key) &&
          obj.value != null
        ) {
          return String(obj.value);
        }
      }
    }
    return undefined;
  }

  let campaignId: string | undefined;
  let roundId: string | undefined;
  let formType: string | undefined;

  // 0. Check URL query parameters (Fillout sends params on the webhook URL itself)
  const searchParams = request.nextUrl.searchParams;
  if (searchParams.has("campaign_id")) campaignId = searchParams.get("campaign_id")!;
  if (searchParams.has("round_id")) roundId = searchParams.get("round_id")!;
  if (searchParams.has("form_type")) formType = searchParams.get("form_type")!;

  // 1. Check urlParameters array
  if (Array.isArray(body.urlParameters)) {
    campaignId = findInArray(body.urlParameters, "campaign_id");
    roundId = findInArray(body.urlParameters, "round_id");
    formType = findInArray(body.urlParameters, "form_type");
  }

  // 2. Check questions array (Fillout may include URL params as hidden fields)
  if (!campaignId && Array.isArray(body.questions)) {
    campaignId = campaignId || findInArray(body.questions, "campaign_id");
    roundId = roundId || findInArray(body.questions, "round_id");
    formType = formType || findInArray(body.questions, "form_type");
  }

  // 3. Check submission.questions (some Fillout payloads nest under submission)
  if (!campaignId && body.submission) {
    const sub = body.submission;
    if (Array.isArray(sub.urlParameters)) {
      campaignId = campaignId || findInArray(sub.urlParameters, "campaign_id");
      roundId = roundId || findInArray(sub.urlParameters, "round_id");
      formType = formType || findInArray(sub.urlParameters, "form_type");
    }
    if (Array.isArray(sub.questions)) {
      campaignId = campaignId || findInArray(sub.questions, "campaign_id");
      roundId = roundId || findInArray(sub.questions, "round_id");
      formType = formType || findInArray(sub.questions, "form_type");
    }
  }

  // 4. Fallback: check top-level fields
  if (!campaignId) campaignId = body.campaign_id ? String(body.campaign_id) : undefined;
  if (!roundId) roundId = body.round_id ? String(body.round_id) : undefined;
  if (!formType) formType = body.form_type ? String(body.form_type) : undefined;

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
