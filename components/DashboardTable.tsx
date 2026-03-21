"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CampaignStatus, DashboardCampaign } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";

const CAMPAIGN_STATUSES: CampaignStatus[] = [
  "Onboarding to be sent",
  "Waiting for onboarding",
  "Active",
  "Placements Completed",
  "Wrapped",
];

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
  const router = useRouter();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savingCampaignId, setSavingCampaignId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [statusDrafts, setStatusDrafts] = useState<Record<string, CampaignStatus>>({});

  useEffect(() => {
    setStatusDrafts({});
  }, [data]);

  async function handleCopyLink(url: string) {
    await navigator.clipboard.writeText(url);
    setCopiedId(url);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleStatusChange(
    campaignId: string,
    currentStatus: CampaignStatus,
    nextStatus: CampaignStatus
  ) {
    if (currentStatus === nextStatus) return;

    setSaveError(null);
    setStatusDrafts((prev) => ({ ...prev, [campaignId]: nextStatus }));
    setSavingCampaignId(campaignId);

    try {
      const res = await fetch("/api/update-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          status: nextStatus,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setStatusDrafts((prev) => ({ ...prev, [campaignId]: currentStatus }));
        setSaveError(payload?.error || "Failed to update campaign status.");
        return;
      }

      router.refresh();
    } catch {
      setStatusDrafts((prev) => ({ ...prev, [campaignId]: currentStatus }));
      setSaveError("Failed to update campaign status.");
    } finally {
      setSavingCampaignId(null);
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      {saveError && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {saveError}
        </div>
      )}
      <table className="w-full min-w-[980px] text-left text-sm xl:min-w-[1080px]">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            <th className="px-4 py-3 font-medium text-gray-500">Client</th>
            <th className="px-4 py-3 font-medium text-gray-500">Campaign</th>
            <th className="px-4 py-3 font-medium text-gray-500">Manager</th>
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
            const portalClientUrl = `${baseUrl}/portal/${clientPortalId}`;
            const selectedStatus = statusDrafts[campaign.id] ?? campaign.status;
            const isEvergreen = campaign.category === "Evergreen";
            const isSaving = savingCampaignId === campaign.id;

            const copyStatus =
              isEvergreen
                ? "none"
                : campaign.onboardingRounds.some((r) => r.complete)
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
                    prefetch={false}
                    className="hover:text-blue-600 hover:underline"
                  >
                    {campaign.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-900">
                  {campaign.campaignManager}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedStatus}
                      disabled={isSaving || isEvergreen}
                      onChange={(e) =>
                        handleStatusChange(
                          campaign.id,
                          selectedStatus,
                          e.target.value as CampaignStatus
                        )
                      }
                      className="min-w-44 rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                    >
                      {CAMPAIGN_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    <StatusBadge status={selectedStatus} />
                  </div>
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
                    onClick={() => handleCopyLink(portalClientUrl)}
                    className="whitespace-nowrap rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {copiedId === portalClientUrl
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
                colSpan={8}
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
