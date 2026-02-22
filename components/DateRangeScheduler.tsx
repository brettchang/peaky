"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Placement, DateRangeCapacity } from "@/lib/types";
import { DAILY_CAPACITY_LIMITS } from "@/lib/types";

interface Props {
  campaignId: string;
  placements: Placement[];
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function DateRangeScheduler({ campaignId, placements }: Props) {
  const router = useRouter();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capacity, setCapacity] = useState<DateRangeCapacity | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ scheduled: number; errors: { placementId: string; error: string }[] } | null>(null);

  const allUnscheduled = useMemo(
    () => placements.filter((p) => !p.scheduledDate),
    [placements]
  );

  // Unscheduled placements with capped types (for the availability grid)
  const unscheduledCapped = useMemo(
    () => placements.filter((p) => !p.scheduledDate && DAILY_CAPACITY_LIMITS[p.type] !== null),
    [placements]
  );

  // Determine which type+publication combos are relevant for the grid
  const relevantCappedCombos = useMemo(() => {
    const combos = new Set<string>();
    for (const p of unscheduledCapped) {
      combos.add(`${p.publication}|${p.type}`);
    }
    return combos;
  }, [unscheduledCapped]);

  if (allUnscheduled.length === 0) return null;

  function countBatchAssignments(date: string, type: string, pub: string, excludeId?: string): number {
    return Object.entries(assignments).filter(([pid, d]) => {
      if (d !== date) return false;
      if (excludeId && pid === excludeId) return false;
      const p = allUnscheduled.find((pl) => pl.id === pid);
      return p && p.type === type && p.publication === pub;
    }).length;
  }

  async function handleCheckAvailability() {
    setError(null);
    setResult(null);
    setAssignments({});

    if (!startDate || !endDate) {
      setError("Please select both start and end dates");
      return;
    }
    if (startDate > endDate) {
      setError("Start date must be before end date");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `/api/schedule-capacity?startDate=${startDate}&endDate=${endDate}`
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch capacity");
      }
      const data: DateRangeCapacity = await res.json();
      setCapacity(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  function getAvailableDatesForPlacement(placement: Placement): { date: string; available: boolean }[] {
    if (!capacity) return [];

    return capacity.days.map((day) => {
      const limit = DAILY_CAPACITY_LIMITS[placement.type];
      if (limit === null) {
        return { date: day.date, available: true };
      }
      const slot = day.slots.find(
        (s) => s.publication === placement.publication && s.type === placement.type
      );
      const batchUsed = countBatchAssignments(day.date, placement.type, placement.publication, placement.id);
      const serverAvailable = slot ? (slot.available ?? 0) : 0;
      return { date: day.date, available: serverAvailable - batchUsed > 0 };
    });
  }

  async function handleSchedule() {
    const toSchedule = Object.entries(assignments)
      .filter(([, date]) => date !== "")
      .map(([placementId, scheduledDate]) => ({
        campaignId,
        placementId,
        scheduledDate,
      }));

    if (toSchedule.length === 0) return;

    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/bulk-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments: toSchedule }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to schedule placements");
      }

      setResult({ scheduled: data.scheduled, errors: data.errors });
      if (data.scheduled > 0) {
        setAssignments({});
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  const assignmentCount = Object.values(assignments).filter((d) => d !== "").length;

  return (
    <div className="mb-8 rounded-lg border border-gray-200 bg-white px-6 py-5">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">
        Schedule Placements
      </h2>
      <p className="mb-4 text-sm text-gray-500">
        {allUnscheduled.length} unscheduled placement{allUnscheduled.length !== 1 ? "s" : ""}. Pick a date range to see availability and assign dates.
      </p>

      {/* Date range picker */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Start Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            End Date
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
        <button
          onClick={handleCheckAvailability}
          disabled={loading || !startDate || !endDate}
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? "Checking..." : "Check Availability"}
        </button>
      </div>

      {error && (
        <p className="mb-4 text-sm text-red-600">{error}</p>
      )}

      {/* Availability grid */}
      {capacity && capacity.days.length > 0 && relevantCappedCombos.size > 0 && (
        <div className="mb-6 overflow-x-auto">
          <h3 className="mb-2 text-sm font-medium text-gray-700">
            Availability (capped types only)
          </h3>
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-2 pr-3 text-left font-medium text-gray-600">
                  Date
                </th>
                {Array.from(relevantCappedCombos).map((combo) => {
                  const [pub, type] = combo.split("|");
                  return (
                    <th
                      key={combo}
                      className="px-2 py-2 text-center font-medium text-gray-600"
                    >
                      <div>{type}</div>
                      <div className="font-normal text-gray-400">{pub}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {capacity.days.map((day) => (
                <tr key={day.date} className="border-b border-gray-100">
                  <td className="py-1.5 pr-3 font-medium text-gray-700">
                    {formatDateShort(day.date)}
                  </td>
                  {Array.from(relevantCappedCombos).map((combo) => {
                    const [pub, type] = combo.split("|");
                    const slot = day.slots.find(
                      (s) => s.publication === pub && s.type === type
                    );
                    if (!slot) return <td key={combo} className="px-2 py-1.5 text-center">-</td>;
                    const assignedToday = countBatchAssignments(day.date, type, pub);
                    const effectiveAvailable = (slot.available ?? 0) - assignedToday;
                    const isFull = effectiveAvailable <= 0;
                    return (
                      <td
                        key={combo}
                        className={`px-2 py-1.5 text-center ${
                          isFull ? "text-gray-400" : "text-green-700"
                        }`}
                      >
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 ${
                            isFull ? "bg-gray-100" : "bg-green-50"
                          }`}
                        >
                          {slot.used + assignedToday}/{slot.limit}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Assignment dropdowns */}
      {capacity && capacity.days.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-medium text-gray-700">
            Assign Dates
          </h3>
          <div className="space-y-2">
            {allUnscheduled.map((placement) => {
              const dates = getAvailableDatesForPlacement(placement);
              const isCapped = DAILY_CAPACITY_LIMITS[placement.type] !== null;
              return (
                <div
                  key={placement.id}
                  className="flex flex-wrap items-center gap-3 rounded border border-gray-100 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-gray-800">
                      {placement.type}
                    </span>
                    <span className="ml-2 text-xs text-gray-500">
                      {placement.publication}
                    </span>
                    {!isCapped && (
                      <span className="ml-2 text-xs text-gray-400">(no limit)</span>
                    )}
                  </div>
                  <select
                    value={assignments[placement.id] ?? ""}
                    onChange={(e) =>
                      setAssignments((prev) => ({
                        ...prev,
                        [placement.id]: e.target.value,
                      }))
                    }
                    className="rounded border border-gray-300 px-2 py-1 text-sm"
                  >
                    <option value="">Select date...</option>
                    {dates.map(({ date, available }) => (
                      <option
                        key={date}
                        value={date}
                        disabled={!available}
                      >
                        {formatDateShort(date)}
                        {!available ? " (full)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Schedule button */}
      {capacity && assignmentCount > 0 && (
        <button
          onClick={handleSchedule}
          disabled={submitting}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {submitting
            ? "Scheduling..."
            : `Schedule ${assignmentCount} placement${assignmentCount !== 1 ? "s" : ""}`}
        </button>
      )}

      {/* Result feedback */}
      {result && (
        <div className="mt-4">
          {result.scheduled > 0 && (
            <p className="text-sm text-green-700">
              {result.scheduled} placement{result.scheduled !== 1 ? "s" : ""} scheduled successfully.
            </p>
          )}
          {result.errors.length > 0 && (
            <div className="mt-2">
              {result.errors.map((e, i) => (
                <p key={i} className="text-sm text-red-600">
                  {e.error}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
