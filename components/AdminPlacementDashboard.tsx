"use client";

import { useState } from "react";
import Link from "next/link";
import { DashboardCampaign, PlacementStatus, Placement } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";

type FilterTab = "All" | "Needs Action" | "In Review" | "Approved" | "Done" | "On Hold";

const FILTER_STATUSES: Record<Exclude<FilterTab, "All">, PlacementStatus[]> = {
  "Needs Action": ["New Campaign", "Onboarding Requested", "Copywriting in Progress"],
  "In Review": ["Peak Team Review Complete", "Sent for Approval"],
  Approved: ["Approved"],
  Done: ["Done", "Debrief Needed", "Send Debrief"],
  "On Hold": ["Hold", "Client Missed Placement"],
};

const TABS: FilterTab[] = ["All", "Needs Action", "In Review", "Approved", "Done", "On Hold"];

interface PlacementRow {
  clientName: string;
  campaignId: string;
  campaignName: string;
  placement: Placement;
}

export function AdminPlacementDashboard({ data }: { data: DashboardCampaign[] }) {
  const [activeTab, setActiveTab] = useState<FilterTab>("All");

  const allRows: PlacementRow[] = data.flatMap((d) =>
    d.campaign.placements.map((p) => ({
      clientName: d.clientName,
      campaignId: d.campaign.id,
      campaignName: d.campaign.name,
      placement: p,
    }))
  );

  const filtered =
    activeTab === "All"
      ? allRows
      : allRows.filter((r) => FILTER_STATUSES[activeTab].includes(r.placement.status));

  return (
    <div>
      {/* Filter tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const count =
            tab === "All"
              ? allRows.length
              : allRows.filter((r) => FILTER_STATUSES[tab].includes(r.placement.status)).length;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {tab} ({count})
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-500">Client</th>
              <th className="px-4 py-3 font-medium text-gray-500">Campaign</th>
              <th className="px-4 py-3 font-medium text-gray-500">Type</th>
              <th className="px-4 py-3 font-medium text-gray-500">Publication</th>
              <th className="px-4 py-3 font-medium text-gray-500">Scheduled</th>
              <th className="px-4 py-3 font-medium text-gray-500">Status</th>
              <th className="px-4 py-3 font-medium text-gray-500">Copy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {filtered.map((row) => (
              <tr key={row.placement.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-900">{row.clientName}</td>
                <td className="px-4 py-3 font-medium text-gray-900">
                  <Link
                    href={`/dashboard/${row.campaignId}`}
                    className="hover:text-blue-600 hover:underline"
                  >
                    {row.campaignName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-700">
                  <Link
                    href={`/dashboard/${row.campaignId}/${row.placement.id}`}
                    className="hover:text-blue-600 hover:underline"
                  >
                    {row.placement.type}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-700">{row.placement.publication}</td>
                <td className="px-4 py-3 text-gray-700">
                  {row.placement.scheduledDate
                    ? new Date(row.placement.scheduledDate + "T00:00:00").toLocaleDateString(
                        "en-US",
                        { month: "short", day: "numeric", year: "numeric" }
                      )
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={row.placement.status} />
                </td>
                <td className="px-4 py-3 text-gray-500">v{row.placement.copyVersion}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No placements found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
