import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCampaignById } from "@/lib/db";
import { StatusBadge } from "@/components/StatusBadge";
import { AdminPlacementDetail } from "@/components/AdminPlacementDetail";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Placement Detail — Peak Client Portal",
};

export default async function PlacementDetailPage({
  params,
}: {
  params: Promise<{ campaignId: string; placementId: string }>;
}) {
  const { campaignId, placementId } = await params;
  const campaign = await getCampaignById(campaignId);
  if (!campaign) notFound();

  const placement = campaign.placements.find((p) => p.id === placementId);
  if (!placement) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link
        href={`/dashboard/${campaignId}`}
        className="mb-6 inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
      >
        &larr; Back to {campaign.name}
      </Link>

      {/* Placement header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">
            {placement.name}
          </h1>
          <StatusBadge status={placement.status} />
        </div>
        <p className="mt-1 text-sm text-gray-500">{campaign.name}</p>
      </div>

      <AdminPlacementDetail
        campaignId={campaignId}
        placement={placement}
      />
    </div>
  );
}
