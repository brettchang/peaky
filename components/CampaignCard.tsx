import Link from "next/link";
import { Campaign, getClientDisplayStatus, ClientDisplayStatus } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";

interface CampaignCardProps {
  campaign: Campaign;
  clientPortalId: string;
}

export function CampaignCard({ campaign, clientPortalId }: CampaignCardProps) {
  const dateLabel = `Created ${new Date(campaign.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  const displayStatuses = campaign.placements.map((p) =>
    getClientDisplayStatus(p.status)
  );
  const allSame = displayStatuses.every((s) => s === displayStatuses[0]);

  return (
    <Link
      href={`/portal/${clientPortalId}/${campaign.id}`}
      className="block rounded-lg border border-gray-200 bg-white px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-50"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">
          {campaign.name}
        </h2>
        {allSame && displayStatuses.length > 0 ? (
          <StatusBadge status={displayStatuses[0]} />
        ) : (
          <PlacementStatusSummary statuses={displayStatuses} />
        )}
      </div>
      <p className="mt-1 text-xs text-gray-500">
        {dateLabel} · {campaign.placements.length} placement{campaign.placements.length !== 1 && "s"}
      </p>
    </Link>
  );
}

function PlacementStatusSummary({ statuses }: { statuses: ClientDisplayStatus[] }) {
  const counts: Partial<Record<ClientDisplayStatus, number>> = {};
  for (const s of statuses) {
    counts[s] = (counts[s] || 0) + 1;
  }

  const parts = Object.entries(counts).map(
    ([status, count]) => `${count} ${status}`
  );

  return (
    <span className="text-xs text-gray-500">
      {parts.join(", ")}
    </span>
  );
}
