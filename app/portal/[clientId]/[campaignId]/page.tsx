import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCampaignPageData } from "@/lib/db";
import { getClientDisplayStatus, isOnboardingEditable } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { CopyReview } from "@/components/CopyReview";
import { RevisionHistory } from "@/components/RevisionHistory";
import { OnboardingForm } from "@/components/OnboardingForm";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { clientId: string; campaignId: string };
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const data = await getCampaignPageData(params.clientId, params.campaignId);
  if (!data) {
    return { title: "Campaign Not Found" };
  }
  return {
    title: `${data.campaign.name} — ${data.client.name}`,
  };
}

export default async function CampaignPage({ params }: PageProps) {
  const data = await getCampaignPageData(params.clientId, params.campaignId);

  if (!data) {
    notFound();
  }

  const { client, campaign } = data;
  const editable = isOnboardingEditable(campaign);
  const hasPlacementsWithCopy = campaign.placements.some(
    (p) => p.currentCopy && p.copyVersion > 0
  );

  // Build per-round data: each round with its assigned placements
  const rounds = campaign.onboardingRounds.map((round) => ({
    round,
    placements: campaign.placements.filter(
      (p) => p.onboardingRoundId === round.id
    ),
  }));

  // Placements not assigned to any round
  const unassignedPlacements = campaign.placements.filter(
    (p) => !p.onboardingRoundId
  );

  // Incomplete rounds that still need the client to fill out
  let incompleteRounds = rounds.filter((r) => !r.round.complete && r.placements.length > 0);
  // Completed rounds
  const completedRounds = rounds.filter((r) => r.round.complete && r.placements.length > 0);

  // If there are unassigned placements and no incomplete rounds have placements,
  // pair them with an empty incomplete round so the form still renders
  if (unassignedPlacements.length > 0 && incompleteRounds.length === 0) {
    const emptyIncompleteRound = campaign.onboardingRounds.find(
      (r) => !r.complete
    );
    if (emptyIncompleteRound) {
      incompleteRounds = [{
        round: emptyIncompleteRound,
        placements: unassignedPlacements,
      }];
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8">
        <p className="text-sm text-gray-500">{client.name}</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">{campaign.name}</h1>
        <p className="mt-2 text-sm text-gray-500">
          {campaign.placements.length} placement{campaign.placements.length !== 1 && "s"}
          {" · "}
          Created {new Date(campaign.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </p>
      </div>

      {/* Onboarding Forms — one per incomplete round */}
      {incompleteRounds.map(({ round, placements: roundPlacements }) => (
        <div key={round.id} className="mb-10">
          <OnboardingForm
            campaignId={campaign.id}
            clientPortalId={client.portalId}
            roundId={round.id}
            roundLabel={round.label}
            placements={roundPlacements}
            initialMessaging={campaign.onboardingMessaging}
            initialDesiredAction={campaign.onboardingDesiredAction}
            editable={editable}
            submitted={false}
          />
        </div>
      ))}

      {/* Completed rounds — read-only */}
      {completedRounds.map(({ round, placements: roundPlacements }) => (
        <div key={round.id} className="mb-10">
          <OnboardingForm
            campaignId={campaign.id}
            clientPortalId={client.portalId}
            roundId={round.id}
            roundLabel={round.label}
            placements={roundPlacements}
            initialMessaging={campaign.onboardingMessaging}
            initialDesiredAction={campaign.onboardingDesiredAction}
            editable={false}
            submitted={true}
          />
        </div>
      ))}

      {/* Copy being prepared message */}
      {campaign.status === "Onboarding Form Complete" && !hasPlacementsWithCopy && (
        <div className="mb-10 rounded-lg bg-blue-50 border border-blue-200 px-5 py-4">
          <p className="text-sm font-medium text-blue-800">
            Your copy is being prepared
          </p>
          <p className="mt-1 text-sm text-blue-600">
            Our team is drafting copy for your placements. You&apos;ll be able to review and approve each one once it&apos;s ready.
          </p>
        </div>
      )}

      {/* Placement copy review sections */}
      {hasPlacementsWithCopy && (
        <div className="space-y-10">
          {campaign.placements
            .filter((p) => p.currentCopy && p.copyVersion > 0)
            .map((placement, index, arr) => {
              const displayStatus = getClientDisplayStatus(placement.status);
              return (
                <section key={placement.id}>
                  <div className="mb-4 flex items-center gap-3">
                    <h2 className="text-lg font-semibold text-gray-900">
                      {placement.type}
                    </h2>
                    <StatusBadge status={displayStatus} />
                  </div>
                  <p className="mb-4 text-sm text-gray-500">
                    {placement.publication}
                    {placement.scheduledDate &&
                      ` · Scheduled ${new Date(placement.scheduledDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
                    {placement.copyVersion > 1 && ` · Version ${placement.copyVersion}`}
                  </p>

                  <CopyReview
                    placement={placement}
                    campaignId={campaign.id}
                    clientPortalId={client.portalId}
                  />

                  <RevisionHistory versions={placement.revisionHistory} />

                  {index < arr.length - 1 && (
                    <hr className="mt-10 border-gray-200" />
                  )}
                </section>
              );
            })}
        </div>
      )}
    </div>
  );
}
