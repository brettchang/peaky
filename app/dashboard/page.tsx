import { Metadata } from "next";
import Link from "next/link";
import { getAllCampaignsWithClients } from "@/lib/db";
import { DashboardViewToggle } from "@/components/DashboardViewToggle";
import { CreateCampaignForm } from "@/components/CreateCampaignForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard — Peak Client Portal",
};

export default async function DashboardPage() {
  const data = await getAllCampaignsWithClients();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Campaign Dashboard
          </h1>
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
      <DashboardViewToggle data={data} baseUrl={baseUrl} />
    </div>
  );
}
