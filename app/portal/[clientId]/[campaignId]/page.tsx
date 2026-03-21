import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCampaignPageData, getSetting } from "@/lib/db";
import { getClientDisplayStatus, isClientCopyPlacement } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { CopyReview } from "@/components/CopyReview";
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
  const sortedVisiblePlacements = placementsVisibleInPortal
    .sort((a, b) => comparePlacementDateDistance(a.scheduledDate, b.scheduledDate));
  const requestedSort = searchParams?.sort;
  const activeSort = requestedSort === "status" ? "status" : "date";
  const placementsWithSortApplied =
    activeSort === "status"
      ? [...sortedVisiblePlacements].sort((a, b) => {
          const statusCompare = getClientDisplayStatus(a.status).localeCompare(
            getClientDisplayStatus(b.status)
          );
          if (statusCompare !== 0) return statusCompare;
          return comparePlacementDateDistance(a.scheduledDate, b.scheduledDate);
        })
      : sortedVisiblePlacements;
  const availableStatuses = Array.from(
    new Set(
      placementsWithSortApplied.map((placement) =>
        getClientDisplayStatus(placement.status)
      )
    )
  ).sort((a, b) => a.localeCompare(b));
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
          (placement) =>
            getClientDisplayStatus(placement.status) === activeStatusFilter
        );
  const billingMeta = extractBillingMeta(campaign.notes);
  const wantsPeakCopy = billingMeta.wantsPeakCopy ?? true;
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

      {!isEvergreen && formRows.length > 0 && (
        <section className="mb-10 rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">Campaign Forms</h2>
          <p className="mt-1 text-sm text-gray-500">
            Each form opens on its own page.
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
            Since your team is providing copy, open the campaign form above to add final copy, links, images, and preferred dates for each placement.
          </p>
        </div>
      )}

      {hasVisiblePlacements && wantsPeakCopy && (
        <div className="space-y-10">
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
                Date (closest to today)
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
                  </p>

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

function comparePlacementDateDistance(dateA?: string | null, dateB?: string | null) {
  const a = getSignedDistanceFromToday(dateA);
  const b = getSignedDistanceFromToday(dateB);

  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  const distanceDiff = Math.abs(a) - Math.abs(b);
  if (distanceDiff !== 0) return distanceDiff;

  // For equal distance, prefer today/upcoming over past dates.
  const aIsUpcoming = a >= 0;
  const bIsUpcoming = b >= 0;
  if (aIsUpcoming !== bIsUpcoming) return aIsUpcoming ? -1 : 1;

  return a - b;
}

function getSignedDistanceFromToday(date?: string | null) {
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return parsed.getTime() - todayStart.getTime();
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
