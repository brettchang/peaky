import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCampaignById, getClientByCampaignId, getCampaignInvoiceLinks } from "@/lib/db";
import { isXeroConnected } from "@/lib/xero";
import { StatusBadge } from "@/components/StatusBadge";
import { AdminPlacementList } from "@/components/AdminPlacementList";
import { OnboardingStatus } from "@/components/OnboardingStatus";
import { AdLineItems } from "@/components/AdLineItems";
import { BillingDetails } from "@/components/BillingDetails";
import { CampaignInvoiceSection } from "@/components/CampaignInvoiceSection";
import { CampaignMetadataEditor } from "@/components/CampaignMetadataEditor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Campaign Detail — Peak Client Portal",
};

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const campaign = await getCampaignById(campaignId);
  if (!campaign) notFound();

  const [client, xeroStatus, invoiceLinks] = await Promise.all([
    getClientByCampaignId(campaignId),
    isXeroConnected(),
    getCampaignInvoiceLinks(campaignId),
  ]);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const portalUrl = client
    ? `${baseUrl}/portal/${client.portalId}`
    : "";

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
      >
        &larr; Back to Dashboard
      </Link>

      {/* Campaign header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{campaign.name}</h1>
          <StatusBadge status={campaign.status} />
        </div>
        {client && (
          <p className="mt-1 text-sm text-gray-500">{client.name}</p>
        )}
      </div>

      {/* Metadata grid */}
      <CampaignMetadataEditor
        campaignId={campaign.id}
        campaign={{
          name: campaign.name,
          status: campaign.status,
          campaignManager: campaign.campaignManager,
          contactName: campaign.contactName,
          contactEmail: campaign.contactEmail,
          notes: campaign.notes,
          placementCount: campaign.placements.length,
          invoiceCadenceLabel:
            campaign.billingOnboarding?.complete && campaign.billingOnboarding.invoiceCadence
              ? campaign.billingOnboarding.invoiceCadence.type === "lump-sum"
                ? `Lump Sum (${campaign.billingOnboarding.invoiceCadence.paymentTerms})`
                : campaign.billingOnboarding.invoiceCadence.type === "equal-monthly"
                ? "Equal Monthly"
                : "Per-Month Usage"
              : undefined,
        }}
      />

      {/* Onboarding */}
      <OnboardingStatus
        rounds={campaign.onboardingRounds}
        campaignId={campaign.id}
        billingOnboarding={campaign.billingOnboarding}
        placements={campaign.placements}
      />

      {/* Billing Details */}
      {campaign.billingOnboarding?.complete && (
        <BillingDetails billing={campaign.billingOnboarding} />
      )}

      {/* Xero Invoices */}
      {xeroStatus.connected && (
        <CampaignInvoiceSection
          campaignId={campaign.id}
          invoiceLinks={invoiceLinks}
        />
      )}

      {/* Ad Line Items */}
      <AdLineItems
        campaignId={campaign.id}
        adLineItems={campaign.adLineItems ?? []}
        placements={campaign.placements}
      />

      {/* Placements */}
      <AdminPlacementList
        placements={campaign.placements}
        campaignId={campaign.id}
        portalUrl={portalUrl}
        onboardingRounds={campaign.onboardingRounds}
      />
    </div>
  );
}
