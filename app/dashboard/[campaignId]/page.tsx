import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCampaignById,
  getClientByCampaignId,
  getCampaignInvoiceLinks,
  getPlacementInvoiceLinks,
  getSetting,
} from "@/lib/db";
import { isXeroConnected } from "@/lib/xero";
import { StatusBadge } from "@/components/StatusBadge";
import { AdminPlacementList } from "@/components/AdminPlacementList";
import { OnboardingStatus } from "@/components/OnboardingStatus";
import { AdLineItems } from "@/components/AdLineItems";
import { BillingDetails } from "@/components/BillingDetails";
import { CampaignInvoiceSection } from "@/components/CampaignInvoiceSection";
import { CampaignMetadataEditor } from "@/components/CampaignMetadataEditor";
import { GenerateCopyButton } from "@/components/GenerateCopyButton";
import { CreateIoButton } from "@/components/CreateIoButton";
import { CampaignManagerNotesPanel } from "@/components/CampaignManagerNotesPanel";
import {
  onboardingOverridesSettingKey,
  parseCampaignOnboardingOverrides,
} from "@/lib/onboarding-overrides";
import { getPortalBaseUrl } from "@/lib/urls";
import { isAiCopyGeneratableType } from "@/lib/types";

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

  const [
    client,
    xeroStatus,
    invoiceLinks,
    onboardingOverridesRaw,
  ] = await Promise.all([
    getClientByCampaignId(campaignId),
    isXeroConnected(),
    getCampaignInvoiceLinks(campaignId),
    getSetting(onboardingOverridesSettingKey(campaignId)),
  ]);
  const onboardingOverrides = parseCampaignOnboardingOverrides(
    onboardingOverridesRaw
  );
  const completedOnboardingRounds = campaign.onboardingRounds.filter((r) => r.complete);

  // Fetch placement invoice links in parallel
  const placementInvoiceEntries = await Promise.all(
    campaign.placements.map(async (p) => {
      const links = await getPlacementInvoiceLinks(p.id);
      return [p.id, links] as const;
    })
  );
  const invoiceLinksByPlacement: Record<string, import("@/lib/xero-types").PlacementInvoiceLink[]> =
    Object.fromEntries(placementInvoiceEntries);

  const baseUrl = getPortalBaseUrl();
  const portalBaseUrl = client
    ? `${baseUrl}/portal/${client.portalId}`
    : "";
  const portalCampaignUrl = portalBaseUrl
    ? `${portalBaseUrl}/${campaign.id}`
    : "";
  const ioDisabledReason = !campaign.billingOnboarding?.billingContactName ||
    !campaign.billingOnboarding?.billingContactEmail
    ? "Complete billing contact name/email before creating an IO."
    : !campaign.adLineItems || campaign.adLineItems.length === 0
      ? "Add campaign line items before creating an IO."
      : undefined;

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
        </div>
        {client && (
          <p className="mt-1 text-sm text-gray-500">{client.name}</p>
        )}
        <div className="mt-3">
          <CreateIoButton
            campaignId={campaign.id}
            existingDocumentUrl={campaign.pandadocDocumentUrl}
            existingStatus={campaign.pandadocStatus}
            disabledReason={ioDisabledReason}
          />
        </div>
      </div>

      {/* Metadata grid */}
      <CampaignMetadataEditor
        campaignId={campaign.id}
        campaign={{
          name: campaign.name,
          clientName: client?.name,
          category: campaign.category,
          status: campaign.status,
          longTermClient: campaign.longTermClient,
          complementaryCampaign: campaign.complementaryCampaign,
          salesPerson: campaign.salesPerson,
          campaignManager: campaign.campaignManager,
          currency: campaign.currency,
          taxEligible: campaign.taxEligible,
          legacyOnboardingDocUrl: campaign.legacyOnboardingDocUrl,
          contactName: campaign.contactName,
          contactEmail: campaign.contactEmail,
          contacts: campaign.contacts,
          notes: extractCleanNotes(campaign.notes),
          placementCount: campaign.placements.length,
          specialInvoicingInstructions:
            campaign.billingOnboarding?.specialInstructions,
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

      <CampaignManagerNotesPanel
        campaignId={campaign.id}
        defaultAuthor={campaign.campaignManager}
        notes={campaign.campaignManagerNotes}
      />

      {/* Onboarding */}
      {campaign.category !== "Evergreen" && (
        <OnboardingStatus
          rounds={campaign.onboardingRounds}
          campaignId={campaign.id}
          billingOnboarding={campaign.billingOnboarding}
          placements={campaign.placements}
          onboardingSubmittedAt={campaign.onboardingSubmittedAt}
          portalUrl={portalBaseUrl}
          overrides={onboardingOverrides}
        />
      )}

      {/* Client Onboarding Briefs — per round */}
      {completedOnboardingRounds.length > 0 && (
        <details className="mb-8 rounded-lg border border-gray-200 bg-white">
          <summary className="flex cursor-pointer items-center justify-between px-5 py-4 text-sm font-semibold text-gray-700 marker:content-none">
            <span>Client Onboarding Briefs</span>
            <span className="text-xs font-medium text-gray-500">
              {completedOnboardingRounds.length} submitted round
              {completedOnboardingRounds.length === 1 ? "" : "s"}
            </span>
          </summary>

          <div className="space-y-4 border-t border-gray-100 px-5 py-4">
            {/* Campaign-level script direction (shared) */}
            {(campaign.onboardingCampaignObjective ||
              campaign.onboardingKeyMessage ||
              campaign.onboardingTalkingPoints ||
              campaign.onboardingCallToAction ||
              campaign.onboardingTargetAudience ||
              campaign.onboardingToneGuidelines) && (
              <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
                {campaign.onboardingCampaignObjective && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Campaign Objective</p>
                    <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
                      {campaign.onboardingCampaignObjective}
                    </p>
                  </div>
                )}
                {campaign.onboardingKeyMessage && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Key Message</p>
                    <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
                      {campaign.onboardingKeyMessage}
                    </p>
                  </div>
                )}
                {campaign.onboardingTalkingPoints && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Talking Points</p>
                    <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
                      {campaign.onboardingTalkingPoints}
                    </p>
                  </div>
                )}
                {campaign.onboardingCallToAction && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Call to Action</p>
                    <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
                      {campaign.onboardingCallToAction}
                    </p>
                  </div>
                )}
                {campaign.onboardingTargetAudience && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Target Audience</p>
                    <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
                      {campaign.onboardingTargetAudience}
                    </p>
                  </div>
                )}
                {campaign.onboardingToneGuidelines && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tone / Brand Guidelines</p>
                    <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
                      {campaign.onboardingToneGuidelines}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Per-round briefs */}
            {completedOnboardingRounds.map((round) => {
              const roundPlacements = campaign.placements.filter(
                (p) => p.onboardingRoundId === round.id
              );
              const hasUngenerated = roundPlacements.some((p) => {
                if (!isAiCopyGeneratableType(p.type)) return false;
                return (
                  p.copyVersion === 0 ||
                  p.status === "Copywriting in Progress" ||
                  p.status === "Drafting Script"
                );
              });
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
        </details>
      )}

      {/* Billing Details */}
      {campaign.billingOnboarding && (
        <BillingDetails campaignId={campaign.id} billing={campaign.billingOnboarding} />
      )}

      {/* Xero Invoices */}
      {xeroStatus.connected && (
        <CampaignInvoiceSection
          campaignId={campaign.id}
          invoiceLinks={invoiceLinks}
          complementaryCampaign={campaign.complementaryCampaign ?? false}
          specialInvoicingInstructions={
            campaign.billingOnboarding?.specialInstructions
          }
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
        portalUrl={portalCampaignUrl}
        onboardingRounds={campaign.onboardingRounds}
        isEvergreen={campaign.category === "Evergreen"}
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
