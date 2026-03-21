import { Metadata } from "next";
import { notFound } from "next/navigation";
import { OnboardingForm } from "@/components/OnboardingForm";
import { getCampaignById, getClientByCampaignId, getSetting } from "@/lib/db";
import {
  onboardingOverridesSettingKey,
  parseCampaignOnboardingOverrides,
} from "@/lib/onboarding-overrides";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ campaignId: string; roundId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { campaignId, roundId } = await params;
  const campaign = await getCampaignById(campaignId);
  if (!campaign) {
    return { title: "Onboarding Not Found" };
  }

  const round = campaign.onboardingRounds.find((entry) => entry.id === roundId);
  if (!round) {
    return { title: "Onboarding Not Found" };
  }

  return {
    title: `Edit ${round.label || "Onboarding Form"} — ${campaign.name}`,
  };
}

export default async function DashboardOnboardingEditPage({ params }: PageProps) {
  const { campaignId, roundId } = await params;
  const [campaign, client, onboardingOverridesRaw] = await Promise.all([
    getCampaignById(campaignId),
    getClientByCampaignId(campaignId),
    getSetting(onboardingOverridesSettingKey(campaignId)),
  ]);

  if (!campaign || !client) {
    notFound();
  }

  const overrides = parseCampaignOnboardingOverrides(onboardingOverridesRaw);
  const round = campaign.onboardingRounds.find((entry) => entry.id === roundId);
  if (!round || overrides.rounds[round.id]) {
    notFound();
  }

  const billingMeta = extractBillingMeta(campaign.notes);
  const wantsPeakCopy = billingMeta.wantsPeakCopy ?? true;
  const roundPlacements = campaign.placements.filter(
    (placement) => placement.onboardingRoundId === round.id
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8">
        <p className="text-sm text-gray-500">{client.name}</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">{campaign.name}</h1>
      </div>

      {roundPlacements.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">
            {round.label || "Onboarding Form"}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            This round has no placements assigned yet.
          </p>
        </div>
      ) : (
        <OnboardingForm
          campaignId={campaign.id}
          clientPortalId={client.portalId}
          roundId={round.id}
          roundLabel={round.label}
          formType={round.formType}
          placements={roundPlacements}
          clientProvidesCopy={!wantsPeakCopy}
          initialCampaignObjective={campaign.onboardingCampaignObjective}
          initialKeyMessage={campaign.onboardingKeyMessage}
          initialTalkingPoints={campaign.onboardingTalkingPoints}
          initialCallToAction={campaign.onboardingCallToAction}
          initialTargetAudience={campaign.onboardingTargetAudience}
          initialToneGuidelines={campaign.onboardingToneGuidelines}
          editable
          submitted={round.complete}
          adminMode
          backHref={`/dashboard/${campaign.id}`}
          backLabel="Back to campaign"
        />
      )}
    </div>
  );
}

function extractBillingMeta(notes?: string): {
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
      wantsPeakCopy?: boolean;
    };
  } catch {
    return {};
  }
}
