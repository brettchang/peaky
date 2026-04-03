import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OnboardingForm } from "@/components/OnboardingForm";
import { getCampaignPageData, getSetting } from "@/lib/db";
import { isOnboardingEditable } from "@/lib/types";
import {
  onboardingOverridesSettingKey,
  parseCampaignOnboardingOverrides,
} from "@/lib/onboarding-overrides";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { clientId: string; campaignId: string; roundId: string };
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const data = await getCampaignPageData(params.clientId, params.campaignId);
  if (!data) {
    return { title: "Form Not Found" };
  }

  const round = data.campaign.onboardingRounds.find((r) => r.id === params.roundId);
  if (!round) {
    return { title: "Form Not Found" };
  }

  return {
    title: `${round.label || "Onboarding Form"} — ${data.campaign.name}`,
  };
}

export default async function CampaignRoundFormPage({ params }: PageProps) {
  const data = await getCampaignPageData(params.clientId, params.campaignId);

  if (!data) {
    notFound();
  }

  const { client, campaign } = data;
  const overrides = parseCampaignOnboardingOverrides(
    await getSetting(onboardingOverridesSettingKey(campaign.id))
  );
  const isEvergreen = campaign.category === "Evergreen";
  if (isEvergreen) {
    notFound();
  }

  const wantsPeakCopy = campaign.billingOnboarding?.wantsPeakCopy ?? true;

  const round = campaign.onboardingRounds.find((entry) => entry.id === params.roundId);
  if (!round) {
    notFound();
  }
  if (overrides.rounds[round.id]) {
    notFound();
  }

  const roundPlacements = campaign.placements.filter(
    (placement) => placement.onboardingRoundId === round.id
  );
  const editable = isOnboardingEditable(campaign);

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

      {roundPlacements.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">
            {round.label || "Onboarding Form"}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            This form has no placements assigned yet.
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
          editable={round.complete ? false : editable}
          submitted={round.complete}
        />
      )}
    </div>
  );
}
