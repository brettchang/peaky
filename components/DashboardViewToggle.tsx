"use client";

import { useState } from "react";
import {
  CAMPAIGN_MANAGERS,
  CampaignManager,
  CampaignStatus,
  DashboardCampaign,
} from "@/lib/types";
import { DashboardTable } from "@/components/DashboardTable";
import { CalendarView } from "@/components/CalendarView";
import { AdminPlacementDashboard } from "@/components/AdminPlacementDashboard";

type View = "table" | "calendar" | "placements";
type PublicationFilter = "All" | "The Peak" | "Peak Money" | "Peak Daily Podcast";
type CategoryFilter = "All" | "Standard" | "Evergreen";
type StatusFilter = "All" | CampaignStatus;
type CampaignManagerFilter = "All" | CampaignManager;

const CAMPAIGN_STATUSES: CampaignStatus[] = [
  "Onboarding to be sent",
  "Waiting for onboarding",
  "Active",
  "Placements Completed",
  "Wrapped",
];

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
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("All");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [campaignManagerFilter, setCampaignManagerFilter] =
    useState<CampaignManagerFilter>("All");

  const managerFilteredData =
    campaignManagerFilter === "All"
      ? data
      : data.filter(
          (row) => row.campaign.campaignManager === campaignManagerFilter
        );

  const categoryFilteredData =
    categoryFilter === "All"
      ? managerFilteredData
      : managerFilteredData.filter(
          (row) => row.campaign.category === categoryFilter
        );

  const statusFilteredData =
    statusFilter === "All"
      ? categoryFilteredData
      : categoryFilteredData.filter(
          (row) => row.campaign.status === statusFilter
        );

  const filteredData =
    publicationFilter === "All"
      ? statusFilteredData
      : statusFilteredData
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
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        {/* Toggle */}
        <div className="inline-flex w-full rounded-lg border border-gray-200 bg-gray-50 p-0.5 sm:w-auto">
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
        <div className="overflow-x-auto">
          <div className="inline-flex min-w-max rounded-lg border border-gray-200 bg-gray-50 p-0.5">
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
        </div>

        <div className="inline-flex w-full rounded-lg border border-gray-200 bg-gray-50 p-0.5 sm:w-auto">
          {(["All", "Standard", "Evergreen"] as CategoryFilter[]).map((option) => (
            <button
              key={option}
              onClick={() => setCategoryFilter(option)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                categoryFilter === option
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        <div className="inline-flex w-full rounded-lg border border-gray-200 bg-gray-50 p-0.5 sm:w-auto">
          {(["All", ...CAMPAIGN_MANAGERS] as CampaignManagerFilter[]).map(
            (option) => (
              <button
                key={option}
                onClick={() => setCampaignManagerFilter(option)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  campaignManagerFilter === option
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {option === "All" ? "All Managers" : option}
              </button>
            )
          )}
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor="campaign-status-filter"
            className="text-xs font-medium uppercase tracking-wide text-gray-500"
          >
            Status
          </label>
          <select
            id="campaign-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-700"
          >
            <option value="All">All statuses</option>
            {CAMPAIGN_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        {view === "calendar" && (
          <div className="overflow-x-auto">
            <div className="inline-flex min-w-max rounded-lg border border-gray-200 bg-gray-50 p-0.5">
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
