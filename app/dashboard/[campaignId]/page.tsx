import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCampaignById, getClientByCampaignId, getCampaignInvoiceLinks, getPlacementInvoiceLinks } from "@/lib/db";
import { isXeroConnected } from "@/lib/xero";
import { StatusBadge } from "@/components/StatusBadge";
import { AdminPlacementList } from "@/components/AdminPlacementList";
import { OnboardingStatus } from "@/components/OnboardingStatus";
import { AdLineItems } from "@/components/AdLineItems";
import { BillingDetails } from "@/components/BillingDetails";
import { CampaignInvoiceSection } from "@/components/CampaignInvoiceSection";
import { CampaignMetadataEditor } from "@/components/CampaignMetadataEditor";
import { DateRangeScheduler } from "@/components/DateRangeScheduler";
import { GenerateCopyButton } from "@/components/GenerateCopyButton";
import { SendOnboardingEmailButton } from "@/components/SendOnboardingEmailButton";

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

  // Fetch placement invoice links in parallel
  const placementInvoiceEntries = await Promise.all(
    campaign.placements.map(async (p) => {
      const links = await getPlacementInvoiceLinks(p.id);
      return [p.id, links] as const;
    })
  );
  const invoiceLinksByPlacement: Record<string, import("@/lib/xero-types").PlacementInvoiceLink[]> =
    Object.fromEntries(placementInvoiceEntries);

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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{campaign.name}</h1>
            <StatusBadge status={campaign.status} />
          </div>
          {client && (
            <SendOnboardingEmailButton
              campaignId={campaign.id}
              campaignName={campaign.name}
              clientName={client.name}
              recipientEmail={campaign.contactEmail}
              recipientName={campaign.contactName}
              portalCampaignUrl={`${portalUrl}/${campaign.id}`}
            />
          )}
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
          clientName: client?.name,
          status: campaign.status,
          salesPerson: campaign.salesPerson,
          campaignManager: campaign.campaignManager,
          contactName: campaign.contactName,
          contactEmail: campaign.contactEmail,
          notes: extractCleanNotes(campaign.notes),
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
        onboardingSubmittedAt={campaign.onboardingSubmittedAt}
        portalUrl={portalUrl}
      />

      {/* Client Onboarding Briefs — per round */}
      {campaign.onboardingRounds.filter((r) => r.complete).length > 0 && (
        <div className="mb-8 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">Client Onboarding Briefs</h3>

          {/* Campaign-level messaging (shared) */}
          {campaign.onboardingMessaging && (
            <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Overall Messaging</p>
                <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
                  {campaign.onboardingMessaging}
                </p>
              </div>
              {campaign.onboardingDesiredAction && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Desired Action</p>
                  <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
                    {campaign.onboardingDesiredAction}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Per-round briefs */}
          {campaign.onboardingRounds
            .filter((r) => r.complete)
            .map((round) => {
              const roundPlacements = campaign.placements.filter(
                (p) => p.onboardingRoundId === round.id
              );
              const hasUngenerated = roundPlacements.some((p) => p.copyVersion === 0);
              return (
                <div key={round.id} className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    {round.label || round.id}
                  </p>
                  {roundPlacements.filter((p) => p.onboardingBrief).length > 0 && (
                    <div className="space-y-2">
                      {roundPlacements
                        .filter((p) => p.onboardingBrief)
                        .map((p) => (
                          <div key={p.id} className="rounded border border-gray-100 bg-gray-50 px-3 py-2">
                            <span className="text-xs font-medium text-gray-600">{p.type} &middot; {p.publication}</span>
                            <p className="mt-0.5 text-sm text-gray-900 whitespace-pre-wrap">{p.onboardingBrief}</p>
                          </div>
                        ))}
                    </div>
                  )}
                  {hasUngenerated && (
                    <div className="pt-2 border-t border-gray-100">
                      <GenerateCopyButton campaignId={campaign.id} roundId={round.id} />
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {/* Billing Details */}
      {campaign.billingOnboarding?.complete && (
        <BillingDetails campaignId={campaign.id} billing={campaign.billingOnboarding} />
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

      {/* Date Range Scheduler */}
      <DateRangeScheduler
        campaignId={campaign.id}
        placements={campaign.placements}
      />

      {/* Placements */}
      <AdminPlacementList
        placements={campaign.placements}
        campaignId={campaign.id}
        portalUrl={portalUrl}
        onboardingRounds={campaign.onboardingRounds}
        invoiceLinksByPlacement={invoiceLinksByPlacement}
        adLineItems={campaign.adLineItems ?? []}
        xeroConnected={xeroStatus.connected}
      />
    </div>
  );
}

function extractCleanNotes(notes?: string): string | undefined {
  if (!notes) return undefined;
  const startTag = "<!-- billing-meta:start -->";
  const endTag = "<!-- billing-meta:end -->";
  const start = notes.indexOf(startTag);
  const end = notes.indexOf(endTag);
  if (start === -1 || end === -1 || end < start) return notes;

  const before = notes.slice(0, start).trim();
  const after = notes.slice(end + endTag.length).trim();
  return [before, after].filter(Boolean).join("\n\n") || undefined;
}
