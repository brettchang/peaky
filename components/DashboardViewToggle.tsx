"use client";

import { useState } from "react";
import { DashboardCampaign } from "@/lib/types";
import { DashboardTable } from "@/components/DashboardTable";
import { CalendarView } from "@/components/CalendarView";
import { AdminPlacementDashboard } from "@/components/AdminPlacementDashboard";

type View = "table" | "calendar" | "placements";

export function DashboardViewToggle({
  data,
  baseUrl,
}: {
  data: DashboardCampaign[];
  baseUrl: string;
}) {
  const [view, setView] = useState<View>("table");

  return (
    <div>
      {/* Toggle */}
      <div className="mb-4 inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
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

      {/* View */}
      {view === "table" ? (
        <DashboardTable data={data} baseUrl={baseUrl} />
      ) : view === "calendar" ? (
        <CalendarView data={data} />
      ) : (
        <AdminPlacementDashboard data={data} />
      )}
    </div>
  );
}
