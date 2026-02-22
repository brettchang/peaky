import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPlacementsForClient } from "@/lib/db";
import { PlacementDashboard } from "@/components/PlacementDashboard";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { clientId: string };
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const data = await getPlacementsForClient(params.clientId);
  if (!data) {
    return { title: "Portal Not Found" };
  }
  return {
    title: `${data.client.name} — Peak Portal`,
  };
}

export default async function PortalHomePage({ params }: PageProps) {
  const data = await getPlacementsForClient(params.clientId);

  if (!data) {
    notFound();
  }

  const { client, placements } = data;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {placements.length} placement{placements.length !== 1 && "s"}
        </p>
      </div>

      <PlacementDashboard
        clientPortalId={client.portalId}
        placements={placements}
      />
    </div>
  );
}
