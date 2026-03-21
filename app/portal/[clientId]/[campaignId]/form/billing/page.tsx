import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BillingOnboardingForm } from "@/components/BillingOnboardingForm";
import { getCampaignPageData, getSetting } from "@/lib/db";
import {
  onboardingOverridesSettingKey,
  parseCampaignOnboardingOverrides,
} from "@/lib/onboarding-overrides";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { clientId: string; campaignId: string };
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const data = await getCampaignPageData(params.clientId, params.campaignId);
  if (!data) {
    return { title: "Billing Form Not Found" };
  }

  return {
    title: `Billing Onboarding — ${data.campaign.name}`,
  };
}

export default async function CampaignBillingFormPage({ params }: PageProps) {
  const data = await getCampaignPageData(params.clientId, params.campaignId);

  if (!data) {
    notFound();
  }

  const { client, campaign } = data;
  const overrides = parseCampaignOnboardingOverrides(
    await getSetting(onboardingOverridesSettingKey(campaign.id))
  );

  if (campaign.category === "Evergreen" || campaign.complementaryCampaign) {
    notFound();
  }

  const billing = campaign.billingOnboarding;
  if (!billing || overrides.billing) {
    notFound();
  }

  const billingMeta = extractBillingMeta(campaign.notes);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link
        href={`/portal/${client.portalId}/${campaign.id}`}
        className="mb-6 inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
      >
        &larr; Back to campaign
      </Link>

      <div className="mb-8">
        <p className="text-sm text-gray-500">{client.name}</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">{campaign.name}</h1>
      </div>

      <BillingOnboardingForm
        campaignId={campaign.id}
        clientPortalId={client.portalId}
        complete={billing.complete}
        initialPrimaryContactName={campaign.contactName}
        initialPrimaryContactEmail={campaign.contactEmail}
        initialRepresentingClient={billingMeta.representingClient}
        initialWantsPeakCopy={billingMeta.wantsPeakCopy ?? true}
        initialCompanyName={billing.companyName}
        initialBillingAddress={billing.billingAddress}
        initialBillingContactName={billing.billingContactName}
        initialBillingContactEmail={billing.billingContactEmail}
        initialIoSigningContactName={billing.ioSigningContactName}
        initialIoSigningContactEmail={billing.ioSigningContactEmail}
        initialSpecificInvoicingInstructions={billing.specialInstructions}
      />
    </div>
  );
}

function extractBillingMeta(notes?: string): {
  representingClient?: boolean;
  wantsPeakCopy?: boolean;
} {
  if (!notes) return {};
  const start = notes.indexOf("<!-- billing-meta:start -->");
  const end = notes.indexOf("<!-- billing-meta:end -->");
  if (start === -1 || end === -1 || end < start) return {};

  const raw = notes
    .slice(start + "<!-- billing-meta:start -->".length, end)
    .trim();
  try {
    return JSON.parse(raw) as {
      representingClient?: boolean;
      wantsPeakCopy?: boolean;
    };
  } catch {
    return {};
  }
}
