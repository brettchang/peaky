"use client";

import { useState } from "react";
import Link from "next/link";
import { DashboardCampaign, PlacementStatus } from "@/lib/types";

const statusBarColor: Record<string, string> = {
  "New Campaign": "bg-gray-400",
  "Copywriting in Progress": "bg-amber-400",
  "Peak Team Review Complete": "bg-yellow-400",
  "Sent for Approval": "bg-blue-400",
  Approved: "bg-green-400",
};

function getBarColor(status: PlacementStatus): string {
  return statusBarColor[status] ?? "bg-gray-400";
}

interface CalendarPlacement {
  placementId: string;
  campaignId: string;
  clientName: string;
  type: string;
  status: PlacementStatus;
  date: string; // YYYY-MM-DD
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function formatMonth(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function CalendarView({ data }: { data: DashboardCampaign[] }) {
  const [currentMonth, setCurrentMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);
  const todayKey = toDateKey(new Date());

  // Flatten all placements with their campaign/client context
  const placements: CalendarPlacement[] = [];
  for (const { campaign, clientName } of data) {
    for (const p of campaign.placements) {
      if (p.scheduledDate) {
        placements.push({
          placementId: p.id,
          campaignId: campaign.id,
          clientName,
          type: p.type,
          status: p.status,
          date: p.scheduledDate,
        });
      }
    }
  }

  // Group by date
  const byDate = new Map<string, CalendarPlacement[]>();
  for (const p of placements) {
    const key = p.date;
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(p);
  }

  // Build grid cells
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // Pad to complete the last week
  while (cells.length % 7 !== 0) cells.push(null);

  function prevMonth() {
    setCurrentMonth(new Date(year, month - 1, 1));
  }

  function nextMonth() {
    setCurrentMonth(new Date(year, month + 1, 1));
  }

  function goToday() {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  }

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="rounded border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            &larr;
          </button>
          <h2 className="min-w-[180px] text-center text-lg font-semibold text-gray-900">
            {formatMonth(currentMonth)}
          </h2>
          <button
            onClick={nextMonth}
            className="rounded border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            &rarr;
          </button>
        </div>
        <button
          onClick={goToday}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Today
        </button>
      </div>

      {/* Grid */}
      <div className="overflow-hidden rounded-lg border border-gray-200">
        {/* Weekday header */}
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
          {weekdays.map((d) => (
            <div
              key={d}
              className="px-2 py-2 text-center text-xs font-medium text-gray-500"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (day === null) {
              return (
                <div
                  key={`empty-${i}`}
                  className="min-h-[100px] border-b border-r border-gray-100 bg-gray-50/50"
                />
              );
            }

            const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayPlacements = byDate.get(dateKey) || [];
            const isToday = dateKey === todayKey;

            return (
              <div
                key={dateKey}
                className={`min-h-[100px] border-b border-r border-gray-100 p-1 ${
                  isToday ? "bg-blue-50/50" : "bg-white"
                }`}
              >
                <div
                  className={`mb-1 text-right text-xs font-medium ${
                    isToday
                      ? "inline-flex h-5 w-5 float-right items-center justify-center rounded-full bg-blue-600 text-white"
                      : "text-gray-500"
                  }`}
                >
                  {day}
                </div>
                <div className="clear-both space-y-0.5">
                  {dayPlacements.map((p, j) => (
                    <Link
                      key={`${p.campaignId}-${p.type}-${j}`}
                      href={`/dashboard/${p.campaignId}/${p.placementId}`}
                      className="group flex overflow-hidden rounded text-left hover:shadow-sm"
                    >
                      <div
                        className={`w-1 shrink-0 rounded-l ${getBarColor(p.status)}`}
                      />
                      <div className="min-w-0 flex-1 rounded-r bg-gray-50 px-1.5 py-0.5 group-hover:bg-gray-100">
                        <div className="truncate text-[11px] font-medium text-gray-800">
                          {p.type}
                        </div>
                        <div className="truncate text-[10px] text-gray-500">
                          {p.clientName}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
