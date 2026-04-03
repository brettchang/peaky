import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCampaignsForClient, getSetting } from "@/lib/db";
import { PlacementDashboard } from "@/components/PlacementDashboard";
import {
  isApprovedStatus,
  isClientCopyPlacement,
  isClientReviewStatus,
} from "@/lib/types";
import {
  onboardingOverridesSettingKey,
  parseCampaignOnboardingOverrides,
} from "@/lib/onboarding-overrides";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { clientId: string };
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const data = await getCampaignsForClient(params.clientId);
  if (!data) {
    return { title: "Portal Not Found" };
  }
  return {
    title: `${data.client.name} — Peak Portal`,
  };
}

export default async function PortalHomePage({ params }: PageProps) {
  const data = await getCampaignsForClient(params.clientId);

  if (!data) {
    notFound();
  }

  const { client, campaigns } = data;
  const standardCampaignWorkflowModes = Array.from(
    new Set(
      campaigns
        .filter((campaign) => campaign.category !== "Evergreen")
        .map((campaign) =>
          (campaign.billingOnboarding?.wantsPeakCopy ?? true)
            ? "peak-writes"
            : "client-writes"
        )
    )
  );
  const overrideEntries = await Promise.all(
    campaigns.map(async (campaign) => {
      const key = onboardingOverridesSettingKey(campaign.id);
      const raw = await getSetting(key);
      return [campaign.id, parseCampaignOnboardingOverrides(raw)] as const;
    })
  );
  const overridesByCampaignId = new Map(overrideEntries);
  const placements = campaigns.flatMap((campaign) =>
    campaign.placements.map((placement) => ({
      campaignId: campaign.id,
      campaignName: campaign.name,
      placement,
    }))
  );

  const todayKey = toDateKey(new Date());
  const formRows = campaigns.flatMap((campaign) => {
    if (campaign.category === "Evergreen") return [];

    const copyFormRows = campaign.onboardingRounds.map((round, index) => {
      const roundPlacements = campaign.placements.filter(
        (placement) => placement.onboardingRoundId === round.id
      );
      const scheduledDates = roundPlacements
        .map((placement) => placement.scheduledDate)
        .filter((date): date is string => !!date)
        .sort();
      const firstPlacementDate = scheduledDates[0];
      const dueDate = firstPlacementDate
        ? subtractBusinessDays(firstPlacementDate, 5)
        : undefined;

      return {
        id: `${campaign.id}-${round.id}`,
        type: "Copy Onboarding" as const,
        isInitialRound: index === 0,
        campaignId: campaign.id,
        campaignName: campaign.name,
        formId: round.id,
        href: `/portal/${client.portalId}/${campaign.id}/form/${round.id}`,
        label: round.label || `Round ${index + 1}`,
        complete: round.complete,
        placementCount: roundPlacements.length,
        firstPlacementDate,
        dueDate,
        overdue: !round.complete && !!dueDate && dueDate < todayKey,
        overridden: Boolean(overridesByCampaignId.get(campaign.id)?.rounds[round.id]),
      };
    });

    const allScheduledDates = campaign.placements
      .map((placement) => placement.scheduledDate)
      .filter((date): date is string => !!date)
      .sort();
    const firstPlacementDate = allScheduledDates[0];
    const dueDate = firstPlacementDate
      ? subtractBusinessDays(firstPlacementDate, 5)
      : undefined;

    const billingFormRow = campaign.billingOnboarding && !campaign.complementaryCampaign
      ? [
          {
            id: `${campaign.id}-billing`,
            type: "Billing Onboarding" as const,
            isInitialRound: false,
            campaignId: campaign.id,
            campaignName: campaign.name,
            formId: "billing",
            href: `/portal/${client.portalId}/${campaign.id}/form/billing`,
            label: "Billing Form",
            complete: campaign.billingOnboarding.complete,
            placementCount: campaign.placements.length,
            firstPlacementDate,
            dueDate,
            overdue:
              !campaign.billingOnboarding.complete &&
              !!dueDate &&
              dueDate < todayKey,
            overridden: Boolean(overridesByCampaignId.get(campaign.id)?.billing),
          },
        ]
      : [];

    return [...copyFormRows, ...billingFormRow];
  });
  const hubFormRows = formRows.filter((row) => {
    if (row.overridden || row.complete || row.placementCount <= 0) return false;
    return true;
  });

  const onboardingActionRows = formRows
    .filter((row) => !row.complete && !row.overridden && row.placementCount > 0)
    .map((row) => ({
      id: row.id,
      campaignId: row.campaignId,
      campaignName: row.campaignName,
      title: `${row.type} · ${row.label}`,
      description: row.dueDate
        ? `${row.overdue ? "Overdue" : "Due"} ${formatDateLong(row.dueDate)} because Peak needs these details at least 5 business days before the first scheduled placement on ${formatDateLong(row.firstPlacementDate!)}.`
        : "Complete this form so Peak has the information needed to draft, schedule, and publish the placement. A due date will appear once a placement date is attached.",
      isUrgent: !!row.overdue,
      ctaLabel: "Open Form",
      href: row.href,
      dueDate: row.dueDate,
    }));

  const copyReviewActionRows = campaigns.flatMap((campaign) =>
    campaign.placements
      .filter(
        (placement) =>
          isClientReviewStatus(placement.status) ||
          (isClientCopyPlacement(placement) && !isApprovedStatus(placement.status))
      )
      .map((placement) => ({
        id: `copy-review-${placement.id}`,
        campaignId: campaign.id,
        campaignName: campaign.name,
        title: `${isClientCopyPlacement(placement) && !isClientReviewStatus(placement.status) ? "Add Copy" : "Client Review"} · ${placement.type} (${placement.publication})`,
        description: placement.scheduledDate
          ? `${
              isClientCopyPlacement(placement) && !isClientReviewStatus(placement.status)
                ? `Scheduled for ${formatDateLong(placement.scheduledDate)}. Peak cannot finalize this placement until your team adds the final copy and approves it in the portal.`
                : `Scheduled for ${formatDateLong(placement.scheduledDate)}. Peak needs your approval or revision request before this placement can move to production.`
            }`
          : isClientCopyPlacement(placement) && !isClientReviewStatus(placement.status)
            ? "Peak is waiting on your final copy and approval before this placement can move forward."
            : "Peak is waiting on your review so we can move this placement forward.",
        isUrgent: false,
        ctaLabel:
          isClientCopyPlacement(placement) && !isClientReviewStatus(placement.status)
            ? "Add Copy"
            : "Review Copy",
        href: `/portal/${client.portalId}/${campaign.id}/${placement.id}`,
        dueDate: placement.scheduledDate
          ? subtractBusinessDays(placement.scheduledDate, 1)
          : undefined,
      }))
  );

  const actionRows = [...onboardingActionRows, ...copyReviewActionRows].sort(
    (a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return a.campaignName.localeCompare(b.campaignName);
    }
  );

  const hasStandardCampaigns = campaigns.some(
    (campaign) => campaign.category !== "Evergreen"
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
        <p className="mt-1 text-sm text-gray-500">
          Track every placement, see what Peak is doing, and know exactly when your team needs to step in.
        </p>
      </div>

      <div className="mb-6 rounded-2xl border border-gray-200 bg-white px-5 py-5">
        <h2 className="text-base font-semibold text-gray-900">
          How this portal works
        </h2>
        {hasStandardCampaigns ? (
          <>
            <p className="mt-2 text-sm text-gray-600">
              Your campaigns may follow one of two workflows depending on who is responsible for writing the copy. Open a campaign to see the exact steps for that campaign.
            </p>
            <div
              className={`mt-4 grid gap-4 ${
                standardCampaignWorkflowModes.length > 1
                  ? "lg:grid-cols-2"
                  : "lg:grid-cols-1"
              }`}
            >
              {standardCampaignWorkflowModes.includes("peak-writes") && (
                <WorkflowCard
                  title="If Peak Is Writing The Copy"
                  steps={[
                    "You complete the onboarding form so we have the details we need.",
                    "Peak writes the copy and adds it to the portal.",
                    "We send the draft to you for review.",
                    "You review the copy, approve it, or request edits.",
                    "Peak publishes the placement once it is approved.",
                  ]}
                />
              )}
              {standardCampaignWorkflowModes.includes("client-writes") && (
                <WorkflowCard
                  title="If Your Team Is Writing The Copy"
                  steps={[
                    "You complete the campaign form and confirm the placement details.",
                    "Your team adds copy directly into each placement in the portal.",
                    "You confirm the final copy is ready to run.",
                    "Peak publishes the placement once your copy is approved.",
                  ]}
                />
              )}
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-gray-600">
            This portal is your source of truth for placement progress, approvals, and performance.
          </p>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Placements</h2>
              <p className="mt-1 text-sm text-gray-500">
                This is your main tracking table. Each row shows the current stage and the next step in plain language.
              </p>
            </div>
            <PlacementDashboard
              clientPortalId={client.portalId}
              placements={placements}
            />
          </div>
        </div>

        <div className="space-y-6 xl:col-span-4">
          <div className="rounded-lg border border-gray-200 bg-white px-5 py-4">
            <h2 className="text-sm font-semibold text-gray-900">Action Required</h2>
            <p className="mt-1 text-sm text-gray-500">
              These are the items currently waiting on your team, with a note explaining why each one matters.
            </p>
            {actionRows.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500">No open actions right now.</p>
            ) : (
              <div className="mt-3 max-h-80 space-y-3 overflow-y-auto pr-1">
                {actionRows.map((row) => (
                  <div
                    key={row.id}
                    className={`rounded-md border px-4 py-3 ${
                      row.isUrgent
                        ? "border-red-200 bg-red-50"
                        : "border-amber-200 bg-amber-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {row.campaignName} · {row.title}
                        </p>
                        <p
                          className={`mt-1 text-xs ${
                            row.isUrgent ? "text-red-700" : "text-gray-600"
                          }`}
                        >
                          {row.description}
                        </p>
                      </div>
                      <Link
                        href={row.href}
                        prefetch={false}
                        className="shrink-0 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
                      >
                        {row.ctaLabel}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 bg-white px-5 py-4">
            <h2 className="text-sm font-semibold text-gray-900">Forms Waiting on You</h2>
            <p className="mt-1 text-sm text-gray-500">
              Complete these forms so Peak has the information needed to draft and schedule placements.
            </p>
            <div className="mt-3 space-y-3">
              {hubFormRows.length === 0 && (
                <p className="text-sm text-gray-500">No open onboarding forms right now.</p>
              )}
              {hubFormRows.slice(0, 6).map((row) => (
                <div
                  key={row.id}
                  className="rounded-md border border-gray-200 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {row.campaignName} · {row.type}
                      </p>
                      <p className="mt-1 text-xs text-gray-600">
                        {row.label} · Not completed
                      </p>
                    </div>
                    <Link
                      href={row.href}
                      prefetch={false}
                      className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Open
                    </Link>
                  </div>
                </div>
              ))}
              {hubFormRows.length > 6 && (
                <p className="text-xs text-gray-500">
                  Showing 6 of {hubFormRows.length} forms.
                </p>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function WorkflowCard({
  title,
  steps,
}: {
  title: string;
  steps: string[];
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {steps.map((step, index) => (
          <CompactWorkflowStep
            key={`${title}-${index}`}
            number={index + 1}
            body={step}
          />
        ))}
      </div>
    </div>
  );
}

function CompactWorkflowStep({
  number,
  body,
}: {
  number: number;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-sm font-semibold text-white">
          {number}
        </div>
        <p className="text-sm leading-6 text-gray-600">{body}</p>
      </div>
    </div>
  );
}


function subtractBusinessDays(dateStr: string, businessDays: number): string {
  const date = new Date(dateStr + "T00:00:00");
  let remaining = businessDays;
  while (remaining > 0) {
    date.setDate(date.getDate() - 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }
  return toDateKey(date);
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLong(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
