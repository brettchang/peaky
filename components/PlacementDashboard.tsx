"use client";

import { useState } from "react";
import Link from "next/link";
import { ClientPlacementRow, PlacementStatus, getClientDisplayStatus } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { PerformanceStats } from "@/components/PerformanceStats";

type FilterTab =
  | "All"
  | "New Campaign"
  | "Copywriting in Progress"
  | "Peak Team Review Complete"
  | "Sent for Approval"
  | "Approved";

const FILTER_TABS: FilterTab[] = [
  "All",
  "New Campaign",
  "Copywriting in Progress",
  "Peak Team Review Complete",
  "Sent for Approval",
  "Approved",
];

function matchesFilter(status: PlacementStatus, filter: FilterTab): boolean {
  if (filter === "All") return true;
  return getClientDisplayStatus(status) === filter;
}

export function PlacementDashboard({
  clientPortalId,
  placements,
}: {
  clientPortalId: string;
  placements: ClientPlacementRow[];
}) {
  const [activeFilter, setActiveFilter] = useState<FilterTab>("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = placements.filter((row) =>
    matchesFilter(row.placement.status, activeFilter)
  );

  return (
    <div>
      <div className="mb-6 flex gap-2">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveFilter(tab)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeFilter === tab
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-500">Placement</th>
              <th className="px-4 py-3 font-medium text-gray-500">Campaign</th>
              <th className="px-4 py-3 font-medium text-gray-500">Publication</th>
              <th className="px-4 py-3 font-medium text-gray-500">Scheduled Date</th>
              <th className="px-4 py-3 font-medium text-gray-500">Status</th>
              <th className="px-4 py-3 font-medium text-gray-500">Performance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {filtered.map((row) => {
              const displayStatus = getClientDisplayStatus(row.placement.status);
              const hasStats = !!row.placement.stats;
              const isExpanded = expandedId === row.placement.id;
              return (
                <>
                  <tr key={row.placement.id} className="group">
                    <td className="px-4 py-3">
                      <Link
                        href={`/portal/${clientPortalId}/${row.campaignId}/${row.placement.id}`}
                        className="font-medium text-gray-900 group-hover:text-blue-600"
                      >
                        {row.placement.type}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-900">
                      {row.campaignName}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {row.placement.publication}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {row.placement.scheduledDate
                        ? new Date(
                            row.placement.scheduledDate + "T00:00:00"
                          ).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : ""}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={displayStatus} />
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {hasStats ? (
                        <button
                          onClick={() =>
                            setExpandedId(isExpanded ? null : row.placement.id)
                          }
                          className="text-xs font-medium text-blue-600 hover:text-blue-800"
                        >
                          {isExpanded ? "Hide Stats" : "View Stats"}
                        </button>
                      ) : (
                        "\u2014"
                      )}
                    </td>
                  </tr>
                  {isExpanded && hasStats && (
                    <tr key={`${row.placement.id}-stats`}>
                      <td colSpan={6} className="bg-gray-50 px-4 py-4">
                        <PerformanceStats stats={row.placement.stats!} />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-gray-500"
                >
                  No placements match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
