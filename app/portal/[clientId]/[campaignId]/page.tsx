import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCampaignPageData } from "@/lib/db";
import { getClientDisplayStatus } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { CopyReview } from "@/components/CopyReview";
import { RevisionHistory } from "@/components/RevisionHistory";

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

      <div className="space-y-10">
        {campaign.placements.map((placement, index) => {
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

              {index < campaign.placements.length - 1 && (
                <hr className="mt-10 border-gray-200" />
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
