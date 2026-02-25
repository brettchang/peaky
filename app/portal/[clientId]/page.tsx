import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCampaignsForClient } from "@/lib/db";
import { PlacementDashboard } from "@/components/PlacementDashboard";

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
  const placements = campaigns.flatMap((campaign) =>
    campaign.placements.map((placement) => ({
      campaignId: campaign.id,
      campaignName: campaign.name,
      placement,
    }))
  );

  const todayKey = toDateKey(new Date());
  const formRows = campaigns.flatMap((campaign) => {
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
        campaignId: campaign.id,
        campaignName: campaign.name,
        formId: round.id,
        label: round.label || `Round ${index + 1}`,
        complete: round.complete,
        placementCount: roundPlacements.length,
        firstPlacementDate,
        dueDate,
        overdue: !round.complete && !!dueDate && dueDate < todayKey,
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

    const billingFormRow = campaign.billingOnboarding
      ? [
          {
            id: `${campaign.id}-billing`,
            type: "Billing Onboarding" as const,
            campaignId: campaign.id,
            campaignName: campaign.name,
            formId: "billing",
            label: "Billing Form",
            complete: campaign.billingOnboarding.complete,
            placementCount: campaign.placements.length,
            firstPlacementDate,
            dueDate,
            overdue:
              !campaign.billingOnboarding.complete &&
              !!dueDate &&
              dueDate < todayKey,
          },
        ]
      : [];

    return [...copyFormRows, ...billingFormRow];
  });

  const onboardingActionRows = formRows
    .filter((row) => !row.complete && row.placementCount > 0)
    .map((row) => ({
      id: row.id,
      campaignId: row.campaignId,
      campaignName: row.campaignName,
      title: `${row.type} · ${row.label}`,
      description: row.dueDate
        ? `${row.overdue ? "Overdue" : "Due"} ${formatDateLong(row.dueDate)} (5 business days before ${formatDateLong(row.firstPlacementDate!)}).`
        : "No hard deadline yet. A due date appears once a placement date is attached.",
      isUrgent: !!row.overdue,
      ctaLabel: "Open Form",
      href: `/portal/${client.portalId}/${row.campaignId}`,
      dueDate: row.dueDate,
    }));

  const copyReviewActionRows = campaigns.flatMap((campaign) =>
    campaign.placements
      .filter(
        (placement) =>
          placement.status === "Peak Team Review Complete" ||
          placement.status === "Sent for Approval"
      )
      .map((placement) => ({
        id: `copy-review-${placement.id}`,
        campaignId: campaign.id,
        campaignName: campaign.name,
        title: `Copy Review · ${placement.type} (${placement.publication})`,
        description: placement.scheduledDate
          ? `Scheduled ${formatDateLong(placement.scheduledDate)}. Please review and approve your copy.`
          : "Please review and approve your copy.",
        isUrgent: false,
        ctaLabel: "Review Copy",
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

  const placementCount = placements.length;
  const approvedCount = placements.filter(
    (row) => row.placement.status === "Approved"
  ).length;
  const reviewCount = placements.filter(
    (row) =>
      row.placement.status === "Peak Team Review Complete" ||
      row.placement.status === "Sent for Approval"
  ).length;
  const pendingFormCount = formRows.filter(
    (row) => !row.complete && row.placementCount > 0
  ).length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage placements, onboarding, and copy approvals in one place.
        </p>
      </div>

      <div className="mb-6 rounded-lg border border-gray-200 bg-white px-5 py-4">
        <h2 className="text-sm font-semibold text-gray-900">
          Welcome to your Peak Client Portal
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Thanks for working with The Peak. We&apos;ll share copy and placement analytics here.
        </p>
        <p className="mt-2 text-sm text-gray-600">
          Process: complete forms, we produce copy, then you edit, suggest changes, or approve.
        </p>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryBox label="Placements" value={placementCount} />
        <SummaryBox label="Ready for Review" value={reviewCount} />
        <SummaryBox label="Approved" value={approvedCount} />
        <SummaryBox
          label="Pending Forms"
          value={pendingFormCount}
          tone={pendingFormCount > 0 ? "alert" : "default"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Placements</h2>
              <p className="mt-1 text-sm text-gray-500">
                This is the main view for tracking status, approvals, and performance.
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
              Complete onboarding tasks and review copy to keep placements on track.
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
            <h2 className="text-sm font-semibold text-gray-900">Onboarding Forms</h2>
            <p className="mt-1 text-sm text-gray-500">
              Open each form and check completion status.
            </p>
            <div className="mt-3 space-y-3">
              {formRows.length === 0 && (
                <p className="text-sm text-gray-500">No onboarding forms yet.</p>
              )}
              {formRows.slice(0, 6).map((row) => (
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
                        {row.label} · {row.complete ? "Completed" : "Not completed"}
                      </p>
                    </div>
                    <Link
                      href={`/portal/${client.portalId}/${row.campaignId}`}
                      className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      View
                    </Link>
                  </div>
                </div>
              ))}
              {formRows.length > 6 && (
                <p className="text-xs text-gray-500">
                  Showing 6 of {formRows.length} forms.
                </p>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function SummaryBox({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "alert";
}) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 ${
        tone === "alert"
          ? "border-amber-300 bg-amber-50"
          : "border-gray-200 bg-white"
      }`}
    >
      <p className="text-xs font-medium text-gray-600">{label}</p>
      <p className="mt-1 text-xl font-semibold text-gray-900">{value}</p>
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
