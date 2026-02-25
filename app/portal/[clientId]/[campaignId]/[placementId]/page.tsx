import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlacementPageData } from "@/lib/db";
import { getClientDisplayStatus } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { CopyReview } from "@/components/CopyReview";
import { RevisionHistory } from "@/components/RevisionHistory";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { clientId: string; campaignId: string; placementId: string };
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const data = await getPlacementPageData(
    params.clientId,
    params.campaignId,
    params.placementId
  );
  if (!data) {
    return { title: "Placement Not Found" };
  }
  return {
    title: `${data.placement.name} — ${data.client.name}`,
  };
}

export default async function PlacementPage({ params }: PageProps) {
  const data = await getPlacementPageData(
    params.clientId,
    params.campaignId,
    params.placementId
  );

  if (!data) {
    notFound();
  }

  const { client, campaign, placement } = data;
  const displayStatus = getClientDisplayStatus(placement.status);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link
        href={`/portal/${client.portalId}`}
        className="mb-6 inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
      >
        &larr; Back to dashboard
      </Link>

      <div className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">
            {placement.name}
          </h1>
          <StatusBadge status={displayStatus} />
        </div>
        <p className="mt-2 text-sm text-gray-500">
          {campaign.name}
          {" · "}
          {placement.publication}
          {placement.scheduledDate &&
            ` · Scheduled ${new Date(placement.scheduledDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}${
              placement.scheduledEndDate && placement.scheduledEndDate > placement.scheduledDate
                ? ` - ${new Date(placement.scheduledEndDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                : ""
            }`}
          {placement.copyVersion > 1 && ` · Version ${placement.copyVersion}`}
        </p>
      </div>

      <CopyReview
        placement={placement}
        campaignId={campaign.id}
        clientPortalId={client.portalId}
      />

      <RevisionHistory versions={placement.revisionHistory} />
    </div>
  );
}
