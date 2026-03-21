import { Metadata } from "next";
import Link from "next/link";
import { getAllCampaignsWithClients } from "@/lib/db";
import { DashboardViewToggle } from "@/components/DashboardViewToggle";
import { CreateCampaignForm } from "@/components/CreateCampaignForm";
import { isClientReviewStatus } from "@/lib/types";
import { getPortalBaseUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard — Peak Client Portal",
};

export default async function DashboardPage() {
  const data = await getAllCampaignsWithClients();
  const portalBaseUrl = getPortalBaseUrl();
  const placementCount = data.reduce(
    (sum, row) => sum + row.campaign.placements.length,
    0
  );
  const scheduledCount = data.reduce(
    (sum, row) =>
      sum + row.campaign.placements.filter((placement) => placement.scheduledDate).length,
    0
  );
  const reviewCount = data.reduce(
    (sum, row) =>
      sum +
      row.campaign.placements.filter(
        (placement) => isClientReviewStatus(placement.status)
      ).length,
    0
  );

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-8">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Campaign Dashboard</h1>
            <p className="mt-1 text-sm text-gray-500">
              {data.length} campaign{data.length !== 1 && "s"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/invoicing"
              className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              View Invoicing
            </Link>
            <CreateCampaignForm />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryBox label="Campaigns" value={data.length} />
          <SummaryBox label="Placements" value={placementCount} />
          <SummaryBox
            label="Scheduled"
            value={`${scheduledCount}/${placementCount || 0}`}
          />
          <SummaryBox
            label="Needs Review"
            value={reviewCount}
            tone={reviewCount > 0 ? "alert" : "default"}
            helper="Placements awaiting Peak-team-approved send step"
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 2xl:grid-cols-12">
        <div className="space-y-4 2xl:col-span-12">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <DashboardViewToggle data={data} baseUrl={portalBaseUrl} />
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
  helper,
}: {
  label: string;
  value: string | number;
  tone?: "default" | "alert";
  helper?: string;
}) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 ${
        tone === "alert"
          ? "border-amber-300 bg-amber-50"
          : "border-gray-200 bg-gray-50"
      }`}
    >
      <p className="text-xs font-medium text-gray-600">{label}</p>
      <p className="mt-1 text-xl font-semibold text-gray-900">{value}</p>
      {helper && <p className="mt-1 text-xs text-gray-500">{helper}</p>}
    </div>
  );
}
