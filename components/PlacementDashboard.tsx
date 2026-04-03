"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import {
  CLIENT_DISPLAY_STATUSES,
  ClientPlacementRow,
  getClientDisplayStatus,
  getClientStatusDescription,
} from "@/lib/types";
import { compareClientPlacementRowsChronologically } from "@/lib/client-portal-placement-sort";
import { StatusBadge } from "@/components/StatusBadge";
import { PerformanceStats } from "@/components/PerformanceStats";

type FilterTab = "All" | typeof CLIENT_DISPLAY_STATUSES[number];

const FILTER_TABS: FilterTab[] = ["All", ...CLIENT_DISPLAY_STATUSES];

function matchesFilter(row: ClientPlacementRow, filter: FilterTab): boolean {
  if (filter === "All") return true;
  return getClientDisplayStatus(row.placement) === filter;
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

  const filtered = placements
    .filter((row) => matchesFilter(row, activeFilter))
    .sort(compareClientPlacementRowsChronologically);

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-2">
        {FILTER_TABS.map((tab) => {
          const count =
            tab === "All"
              ? placements.length
              : placements.filter((row) => matchesFilter(row, tab)).length;

          return (
            <button
              key={tab}
              onClick={() => setActiveFilter(tab)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                activeFilter === tab
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {tab} ({count})
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-500">Placement</th>
              <th className="px-4 py-3 font-medium text-gray-500">Campaign</th>
              <th className="px-4 py-3 font-medium text-gray-500">Scheduled Date</th>
              <th className="px-4 py-3 font-medium text-gray-500">Status</th>
              <th className="px-4 py-3 font-medium text-gray-500">What Happens Next</th>
              <th className="px-4 py-3 font-medium text-gray-500">Performance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {filtered.map((row) => {
              const displayStatus = getClientDisplayStatus(row.placement);
              const statusCopy = getClientStatusDescription(row.placement);
              const hasStats = !!row.placement.stats;
              const isExpanded = expandedId === row.placement.id;
              return (
                <Fragment key={row.placement.id}>
                  <tr key={row.placement.id} className="group">
                    <td className="px-4 py-3">
                      <Link
                        href={`/portal/${clientPortalId}/${row.campaignId}/${row.placement.id}`}
                        prefetch={false}
                        className="font-medium text-gray-900 group-hover:text-blue-600"
                      >
                        {row.placement.type}
                      </Link>
                      <p className="mt-1 text-xs text-gray-500">
                        {row.placement.publication}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-gray-900">
                      {row.campaignName}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {row.placement.scheduledDate
                        ? formatDateRange(
                            row.placement.scheduledDate,
                            row.placement.scheduledEndDate
                          )
                        : "Not scheduled yet"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-2">
                        <StatusBadge status={displayStatus} />
                        <p className="max-w-xs text-xs text-gray-500">
                          {statusCopy.description}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <p className="max-w-xs text-sm">{statusCopy.nextStep}</p>
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
                    <tr>
                      <td colSpan={6} className="bg-gray-50 px-4 py-4">
                        <PerformanceStats stats={row.placement.stats!} />
                      </td>
                    </tr>
                  )}
                </Fragment>
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

function formatDateRange(start: string, end?: string): string {
  const startLabel = new Date(start + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  if (!end || end <= start) return startLabel;
  const endLabel = new Date(end + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${startLabel} - ${endLabel}`;
}
