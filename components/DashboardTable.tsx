"use client";

import { useState } from "react";
import Link from "next/link";
import { DashboardCampaign } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";

function OnboardingDot({
  label,
  status,
}: {
  label: string;
  status: "complete" | "pending" | "none";
}) {
  const bg =
    status === "complete"
      ? "bg-green-500"
      : status === "pending"
      ? "bg-amber-400"
      : "bg-gray-300";

  const title =
    status === "complete"
      ? `${label}: Complete`
      : status === "pending"
      ? `${label}: Pending`
      : `${label}: N/A`;

  return (
    <span
      title={title}
      className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ${bg}`}
    >
      {label}
    </span>
  );
}

export function DashboardTable({
  data,
  baseUrl,
}: {
  data: DashboardCampaign[];
  baseUrl: string;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function handleCopyLink(portalId: string) {
    const url = `${baseUrl}/portal/${portalId}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(portalId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            <th className="px-4 py-3 font-medium text-gray-500">Client</th>
            <th className="px-4 py-3 font-medium text-gray-500">Campaign</th>
            <th className="px-4 py-3 font-medium text-gray-500">Status</th>
            <th className="px-4 py-3 text-center font-medium text-gray-500">Onboarding</th>
            <th className="px-4 py-3 text-center font-medium text-gray-500">Ads Created</th>
            <th className="px-4 py-3 text-center font-medium text-gray-500">Scheduled</th>
            <th className="px-4 py-3 font-medium text-gray-500">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {data.map(({ campaign, clientName, clientPortalId }) => {
            const adsCreated = campaign.placements.length;
            const adsScheduled = campaign.placements.filter(
              (p) => p.scheduledDate
            ).length;

            const copyStatus = campaign.onboardingRounds.some((r) => r.complete)
              ? "complete"
              : "pending";

            const billingStatus = campaign.billingOnboarding
              ? campaign.billingOnboarding.complete
                ? "complete"
                : "pending"
              : "none";

            return (
              <tr key={campaign.id}>
                <td className="px-4 py-3 text-gray-900">{clientName}</td>
                <td className="px-4 py-3 font-medium text-gray-900">
                  <Link
                    href={`/dashboard/${campaign.id}`}
                    className="hover:text-blue-600 hover:underline"
                  >
                    {campaign.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={campaign.status} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-1.5">
                    <OnboardingDot label="C" status={copyStatus} />
                    <OnboardingDot label="B" status={billingStatus} />
                  </div>
                </td>
                <td className="px-4 py-3 text-center text-gray-900">
                  {adsCreated}
                </td>
                <td className="px-4 py-3 text-center text-gray-900">
                  {adsScheduled} / {adsCreated}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleCopyLink(clientPortalId)}
                    className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {copiedId === clientPortalId
                      ? "Copied!"
                      : "Copy Portal Link"}
                  </button>
                </td>
              </tr>
            );
          })}
          {data.length === 0 && (
            <tr>
              <td
                colSpan={7}
                className="px-4 py-8 text-center text-gray-500"
              >
                No campaigns yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
