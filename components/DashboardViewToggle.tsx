"use client";

import { useState } from "react";
import { DashboardCampaign } from "@/lib/types";
import { DashboardTable } from "@/components/DashboardTable";
import { CalendarView } from "@/components/CalendarView";
import { AdminPlacementDashboard } from "@/components/AdminPlacementDashboard";

type View = "table" | "calendar" | "placements";
type PublicationFilter = "All" | "The Peak" | "Peak Money" | "Peak Daily Podcast";

export function DashboardViewToggle({
  data,
  baseUrl,
}: {
  data: DashboardCampaign[];
  baseUrl: string;
}) {
  const [view, setView] = useState<View>("table");
  const [publicationFilter, setPublicationFilter] =
    useState<PublicationFilter>("All");

  const filteredData =
    publicationFilter === "All"
      ? data
      : data
          .map((row) => ({
            ...row,
            campaign: {
              ...row.campaign,
              placements: row.campaign.placements.filter(
                (placement) => placement.publication === publicationFilter
              ),
            },
          }))
          .filter((row) => row.campaign.placements.length > 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* Toggle */}
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          <button
            onClick={() => setView("table")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              view === "table"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Table
          </button>
          <button
            onClick={() => setView("calendar")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              view === "calendar"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Calendar
          </button>
          <button
            onClick={() => setView("placements")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              view === "placements"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Placements
          </button>
        </div>

        {/* Publication filter */}
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          {(["All", "The Peak", "Peak Money", "Peak Daily Podcast"] as PublicationFilter[]).map(
            (option) => (
              <button
                key={option}
                onClick={() => setPublicationFilter(option)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  publicationFilter === option
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {option}
              </button>
            )
          )}
        </div>

        {view === "calendar" && (
          <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            <button
              onClick={() => setPublicationFilter("All")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                publicationFilter !== "Peak Daily Podcast"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Newsletter Calendar
            </button>
            <button
              onClick={() => setPublicationFilter("Peak Daily Podcast")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                publicationFilter === "Peak Daily Podcast"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Podcast Calendar
            </button>
          </div>
        )}
      </div>

      {/* View */}
      {view === "table" ? (
        <DashboardTable data={filteredData} baseUrl={baseUrl} />
      ) : view === "calendar" ? (
        <CalendarView data={filteredData} />
      ) : (
        <AdminPlacementDashboard data={filteredData} />
      )}
    </div>
  );
}
