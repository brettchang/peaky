import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCampaignById, getClientByCampaignId } from "@/lib/db";
import { StatusBadge } from "@/components/StatusBadge";
import { AdminPlacementList } from "@/components/AdminPlacementList";
import { OnboardingStatus } from "@/components/OnboardingStatus";
import { AdLineItems } from "@/components/AdLineItems";
import { BillingDetails } from "@/components/BillingDetails";

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

  const client = await getClientByCampaignId(campaignId);
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
      <div className="mb-8 grid grid-cols-2 gap-x-8 gap-y-4 rounded-lg border border-gray-200 bg-white px-6 py-5 sm:grid-cols-3">
        {campaign.campaignManager && (
          <div>
            <p className="text-xs text-gray-500">Campaign Manager</p>
            <p className="text-sm font-medium text-gray-900">
              {campaign.campaignManager}
            </p>
          </div>
        )}
        {campaign.contactName && (
          <div>
            <p className="text-xs text-gray-500">Contact</p>
            <p className="text-sm font-medium text-gray-900">
              {campaign.contactName}
            </p>
          </div>
        )}
        {campaign.contactEmail && (
          <div>
            <p className="text-xs text-gray-500">Email</p>
            <p className="text-sm font-medium text-gray-900">
              {campaign.contactEmail}
            </p>
          </div>
        )}
        <div>
          <p className="text-xs text-gray-500">Placements</p>
          <p className="text-sm font-medium text-gray-900">
            {campaign.placements.length}
          </p>
        </div>
        {campaign.billingOnboarding?.complete && campaign.billingOnboarding.invoiceCadence && (
          <div>
            <p className="text-xs text-gray-500">Invoice Cadence</p>
            <p className="text-sm font-medium text-gray-900">
              {campaign.billingOnboarding.invoiceCadence.type === "lump-sum"
                ? `Lump Sum (${campaign.billingOnboarding.invoiceCadence.paymentTerms})`
                : campaign.billingOnboarding.invoiceCadence.type === "equal-monthly"
                ? "Equal Monthly"
                : "Per-Month Usage"}
            </p>
          </div>
        )}
      </div>

      {/* Onboarding */}
      <OnboardingStatus
        rounds={campaign.onboardingRounds}
        campaignId={campaign.id}
        billingOnboarding={campaign.billingOnboarding}
      />

      {/* Billing Details */}
      {campaign.billingOnboarding?.complete && (
        <BillingDetails billing={campaign.billingOnboarding} />
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
