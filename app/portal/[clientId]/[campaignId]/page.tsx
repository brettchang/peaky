import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCampaignPageData, getSetting } from "@/lib/db";
import {
  CLIENT_DISPLAY_STATUSES,
  getClientDisplayStatus,
  getClientStatusDescription,
  isClientCopyPlacement,
} from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { CopyReview } from "@/components/CopyReview";
import { comparePlacementsChronologically } from "@/lib/client-portal-placement-sort";
import {
  onboardingOverridesSettingKey,
  parseCampaignOnboardingOverrides,
} from "@/lib/onboarding-overrides";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { clientId: string; campaignId: string };
  searchParams?: {
    status?: string;
    sort?: string;
  };
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

export default async function CampaignPage({ params, searchParams }: PageProps) {
  const data = await getCampaignPageData(params.clientId, params.campaignId);

  if (!data) {
    notFound();
  }

  const { client, campaign } = data;
  const overrides = parseCampaignOnboardingOverrides(
    await getSetting(onboardingOverridesSettingKey(campaign.id))
  );
  const isEvergreen = campaign.category === "Evergreen";
  const placementsVisibleInPortal = campaign.placements.filter(
    (placement) =>
      isClientCopyPlacement(placement) ||
      (placement.currentCopy && placement.copyVersion > 0)
  );
  const hasVisiblePlacements = placementsVisibleInPortal.length > 0;
  const sortedVisiblePlacements = [...placementsVisibleInPortal].sort(
    comparePlacementsChronologically
  );
  const requestedSort = searchParams?.sort;
  const activeSort = requestedSort === "status" ? "status" : "date";
  const placementsWithSortApplied =
    activeSort === "status"
      ? [...sortedVisiblePlacements].sort((a, b) => {
          const statusCompare =
            CLIENT_DISPLAY_STATUSES.indexOf(getClientDisplayStatus(a)) -
            CLIENT_DISPLAY_STATUSES.indexOf(getClientDisplayStatus(b));
          if (statusCompare !== 0) return statusCompare;
          return comparePlacementsChronologically(a, b);
        })
      : sortedVisiblePlacements;
  const availableStatuses = CLIENT_DISPLAY_STATUSES.filter((status) =>
    placementsWithSortApplied.some(
      (placement) => getClientDisplayStatus(placement) === status
    )
  );
  const requestedStatus = searchParams?.status;
  const isKnownStatus = (value: string): value is (typeof availableStatuses)[number] =>
    availableStatuses.some((status) => status === value);
  const activeStatusFilter =
    requestedStatus && isKnownStatus(requestedStatus)
      ? requestedStatus
      : "All";
  const visiblePlacements =
    activeStatusFilter === "All"
      ? placementsWithSortApplied
      : placementsWithSortApplied.filter(
          (placement) => getClientDisplayStatus(placement) === activeStatusFilter
        );
  const wantsPeakCopy = campaign.billingOnboarding?.wantsPeakCopy ?? true;
  const formRows = [
    ...(!isEvergreen &&
    !campaign.complementaryCampaign &&
    campaign.billingOnboarding &&
    !overrides.billing
      ? [
          {
            id: "billing",
            label: "Billing Onboarding",
            complete: campaign.billingOnboarding.complete,
            href: `/portal/${client.portalId}/${campaign.id}/form/billing`,
          },
        ]
      : []),
    ...(!isEvergreen
      ? campaign.onboardingRounds
          .filter((round) => !overrides.rounds[round.id])
          .map((round, index) => ({
            id: round.id,
            label: round.label || `Round ${index + 1} Form`,
            complete: round.complete,
            href: `/portal/${client.portalId}/${campaign.id}/form/${round.id}`,
          }))
      : []),
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link
        href={`/portal/${client.portalId}`}
        className="mb-6 inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
      >
        &larr; Back to portal
      </Link>

      <div className="mb-8">
        <p className="text-sm text-gray-500">{client.name}</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">{campaign.name}</h1>
        <p className="mt-2 text-sm text-gray-500">
          {campaign.placements.length} placement{campaign.placements.length !== 1 && "s"}
          {" · "}
          Created {new Date(campaign.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </p>
      </div>

      {!isEvergreen && (
        <section className="mb-10 rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">
            {wantsPeakCopy ? "How This Campaign Works" : "Your Copy Workflow"}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {wantsPeakCopy
              ? "Peak is responsible for writing the copy for this campaign."
              : "Your team is responsible for writing and confirming the copy for this campaign."}
          </p>
          <div
            className={`mt-4 grid gap-3 ${
              wantsPeakCopy ? "md:grid-cols-2 xl:grid-cols-5" : "md:grid-cols-2 xl:grid-cols-4"
            }`}
          >
            {(wantsPeakCopy
              ? [
                  "You fill out the onboarding form so we have the information we need.",
                  "Peak writes the copy and adds it to the portal.",
                  "We send the draft to you for review.",
                  "You review the copy, approve it, or request edits.",
                  "Peak publishes the placement once it is approved.",
                ]
              : [
                  "You fill out the campaign form and confirm the placement details.",
                  "Your team adds copy directly into each placement in the portal.",
                  "You confirm the final copy is ready to run.",
                  "Peak publishes the placement after your copy is approved.",
                ]
            ).map((step, index) => (
              <div
                key={`${campaign.id}-workflow-${index}`}
                className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-sm font-semibold text-white">
                    {index + 1}
                  </div>
                  <p className="text-sm leading-6 text-gray-600">{step}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!isEvergreen && formRows.length > 0 && (
        <section className="mb-10 rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">Campaign Forms</h2>
          <p className="mt-1 text-sm text-gray-500">
            {wantsPeakCopy
              ? "Complete these forms first so Peak has the information needed to draft and schedule your placements."
              : "Complete these forms first, then add your copy directly into each placement in the portal."}
          </p>
          <div className="mt-4 space-y-3">
            {formRows.map((row) => (
              <div
                key={row.id}
                className="rounded-md border border-gray-200 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {row.label}
                    </p>
                    <p className="mt-1 text-xs text-gray-600">
                      {row.complete ? "Completed" : "Not completed"}
                    </p>
                  </div>
                  <Link
                    href={row.href}
                    prefetch={false}
                    className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {row.complete ? "View" : "Open"}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Copy being prepared message */}
      {!isEvergreen &&
        wantsPeakCopy &&
        campaign.status === "Active" &&
        !hasVisiblePlacements && (
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
      {!isEvergreen && !wantsPeakCopy && formRows.length > 0 && (
        <div className="mb-10 rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-4">
          <p className="text-sm font-medium text-emerald-800">
            Complete your campaign form
          </p>
          <p className="mt-1 text-sm text-emerald-700">
            Since your team is providing copy, use the campaign form above to add final copy, links, images, and preferred dates for each placement.
          </p>
        </div>
      )}

      {hasVisiblePlacements && (
        <div className="space-y-10">
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
              What To Expect
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              {wantsPeakCopy
                ? "Each placement uses plain-English statuses to show whether Peak is waiting on you, actively working, or needs your review before publishing."
                : "Use the placements below to add your copy, confirm it is final, and keep track of what Peak will publish."}
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
              Sort by
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={`/portal/${client.portalId}/${campaign.id}${activeStatusFilter === "All" ? "" : `?status=${encodeURIComponent(activeStatusFilter)}`}`}
                prefetch={false}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  activeSort === "date"
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                Date (oldest to newest)
              </Link>
              <Link
                href={`/portal/${client.portalId}/${campaign.id}?sort=status${activeStatusFilter === "All" ? "" : `&status=${encodeURIComponent(activeStatusFilter)}`}`}
                prefetch={false}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  activeSort === "status"
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                Status
              </Link>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
              Filter by status
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={`/portal/${client.portalId}/${campaign.id}${activeSort === "date" ? "" : "?sort=status"}`}
                prefetch={false}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  activeStatusFilter === "All"
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                All
              </Link>
              {availableStatuses.map((status) => (
                <Link
                  key={status}
                  href={`/portal/${client.portalId}/${campaign.id}?status=${encodeURIComponent(status)}${activeSort === "date" ? "" : "&sort=status"}`}
                  prefetch={false}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    activeStatusFilter === status
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {status}
                </Link>
              ))}
            </div>
          </section>

          {visiblePlacements.length === 0 && (
            <div className="rounded-lg border border-gray-200 bg-white px-5 py-4 text-sm text-gray-600">
              No placements match this status filter.
            </div>
          )}

          {visiblePlacements.map((placement, index, arr) => {
              const displayStatus = getClientDisplayStatus(placement);
              const statusCopy = getClientStatusDescription(placement);
              return (
                <section key={placement.id}>
                  <div className="mb-4 flex items-center gap-3">
                    <h2 className="text-lg font-semibold text-gray-900">
                      {placement.type}
                    </h2>
                    <StatusBadge status={displayStatus} />
                  </div>
                  <p className="mb-2 text-sm text-gray-500">
                    {placement.publication}
                    {placement.scheduledDate &&
                      ` · Scheduled ${new Date(placement.scheduledDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
                  </p>
                  <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">
                      {statusCopy.description}
                    </p>
                    <p className="mt-1 text-sm text-gray-600">
                      Next step: {statusCopy.nextStep}
                    </p>
                  </div>

                  <CopyReview
                    placement={placement}
                    campaignId={campaign.id}
                    clientPortalId={client.portalId}
                  />

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
