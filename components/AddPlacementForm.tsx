"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  OnboardingRound,
  PlacementStatus,
  PlacementType,
  Publication,
  DateRangeCapacity,
  PODCAST_PLACEMENT_TYPES,
  PODCAST_PUBLICATION,
  getDefaultPlacementStatus,
  getPlacementStatusesFor,
  getOnboardingFormTypeForPlacement,
  isPodcastInterviewType,
} from "@/lib/types";
import {
  ADMIN_SCHEDULE_WINDOW_DAYS,
  getAvailableCapacityDates,
  getTodayDateKey,
  isPastDateKey,
} from "@/lib/schedule-capacity";

const TYPE_OPTIONS: Array<{ value: PlacementType; label: string }> = [
  { value: "Primary", label: "Primary" },
  { value: "Secondary", label: "Secondary" },
  { value: "Peak Picks", label: "Peak Picks" },
  { value: ":30 Pre-Roll", label: ":30 Pre-Roll" },
  { value: ":30 Mid-Roll", label: ":30 Mid-Roll" },
  { value: "15 Minute Interview", label: "15 Minute Interview" },
];

const PUBLICATIONS: Array<{ value: Publication; label: string }> = [
  { value: "The Peak", label: "The Peak Daily Newsletter" },
  { value: "Peak Money", label: "Peak Money" },
  { value: PODCAST_PUBLICATION, label: "Peak Daily Podcast" },
];

function isPodcastRollType(type: PlacementType): boolean {
  return type === ":30 Pre-Roll" || type === ":30 Mid-Roll";
}

interface AddPlacementFormProps {
  campaignId: string;
  onboardingRounds?: OnboardingRound[];
  isEvergreen?: boolean;
}

export function AddPlacementForm({
  campaignId,
  onboardingRounds,
  isEvergreen = false,
}: AddPlacementFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<PlacementType>("Primary");
  const [publication, setPublication] = useState<Publication>("The Peak");
  const [status, setStatus] = useState<PlacementStatus>("New Campaign");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledEndDate, setScheduledEndDate] = useState("");
  const [useHistoricalDateOverride, setUseHistoricalDateOverride] = useState(false);
  const [historicalScheduledDate, setHistoricalScheduledDate] = useState("");
  const [capacityDays, setCapacityDays] = useState<DateRangeCapacity["days"]>([]);
  const [capacityLoading, setCapacityLoading] = useState(false);
  const [capacityError, setCapacityError] = useState<string | null>(null);
  const todayKey = useMemo(() => getTodayDateKey(), []);

  const statusOptions = useMemo(
    () => getPlacementStatusesFor(type, publication),
    [type, publication]
  );
  const compatibleOnboardingRounds = useMemo(() => {
    const placementFormType = getOnboardingFormTypeForPlacement({ type, publication });
    return (onboardingRounds ?? []).filter((round) => round.formType === placementFormType);
  }, [onboardingRounds, publication, type]);

  useEffect(() => {
    let cancelled = false;

    const toDateKey = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + ADMIN_SCHEDULE_WINDOW_DAYS);

    setCapacityLoading(true);
    setCapacityError(null);

    fetch(
      `/api/schedule-capacity?startDate=${toDateKey(start)}&endDate=${toDateKey(end)}`
    )
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to load available dates");
        }
        return (await res.json()) as DateRangeCapacity;
      })
      .then((data) => {
        if (cancelled) return;
        setCapacityDays(data.days || []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setCapacityError(
          err instanceof Error ? err.message : "Failed to load available dates"
        );
      })
      .finally(() => {
        if (cancelled) return;
        setCapacityLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function formatDateLabel(date: string): string {
    return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function getAvailableDateOptions(): string[] {
    return getAvailableCapacityDates({
      capacityDays,
      publication,
      type,
      todayKey,
    });
  }

  function handleTypeChange(nextType: PlacementType) {
    setScheduledDate("");
    setType(nextType);
    if (PODCAST_PLACEMENT_TYPES.includes(nextType)) {
      setPublication(PODCAST_PUBLICATION);
      setStatus(
        isEvergreen
          ? "Approved"
          : getDefaultPlacementStatus(nextType, PODCAST_PUBLICATION)
      );
      return;
    }
    const nextPublication =
      publication === PODCAST_PUBLICATION ? "The Peak" : publication;
    if (nextPublication !== publication) setPublication(nextPublication);
    setStatus(
      isEvergreen
        ? "Approved"
        : getDefaultPlacementStatus(nextType, nextPublication)
    );
  }

  function handlePublicationChange(nextPublication: Publication) {
    setScheduledDate("");
    setPublication(nextPublication);
    const nextType =
      nextPublication === PODCAST_PUBLICATION && !PODCAST_PLACEMENT_TYPES.includes(type)
        ? ":30 Pre-Roll"
        : type;
    if (nextType !== type) setType(nextType);
    setStatus(
      isEvergreen
        ? "Approved"
        : getDefaultPlacementStatus(nextType, nextPublication)
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);
    const committedImpressionsRaw = formData.get("committedImpressions");
    const committedImpressions =
      typeof committedImpressionsRaw === "string" &&
      committedImpressionsRaw.trim() !== ""
        ? Number.parseInt(committedImpressionsRaw, 10)
        : undefined;
    const nextScheduledDate = useHistoricalDateOverride
      ? historicalScheduledDate
      : scheduledDate;

    const res = await fetch("/api/add-placement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId,
        type,
        publication,
        scheduledDate: nextScheduledDate || undefined,
        scheduledEndDate: scheduledEndDate || undefined,
        historicalDateOverride:
          useHistoricalDateOverride && isPastDateKey(nextScheduledDate, todayKey)
            ? true
            : undefined,
        interviewScheduled:
          formData.get("interviewScheduled") === "on" ? true : undefined,
        committedImpressions,
        copyProducer: formData.get("copyProducer"),
        status: isEvergreen ? "Approved" : status,
        notes: formData.get("notes") || undefined,
        onboardingRoundId: formData.get("onboardingRoundId") || undefined,
      }),
    });

    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setError(data.error || "Something went wrong");
      return;
    }

    setOpen(false);
    setScheduledDate("");
    setScheduledEndDate("");
    setUseHistoricalDateOverride(false);
    setHistoricalScheduledDate("");
    router.refresh();
  }

  const isPodcastPlacement = publication === PODCAST_PUBLICATION;
  const isInterview = isPodcastInterviewType(type);
  const isPodcastRoll = isPodcastRollType(type);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        + Add Placement
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Add Placement</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={type}
                    onChange={(e) => handleTypeChange(e.target.value as PlacementType)}
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
                  >
                    {TYPE_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Publication <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={publication}
                    onChange={(e) =>
                      handlePublicationChange(e.target.value as Publication)
                    }
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
                  >
                    {PUBLICATIONS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {isPodcastPlacement ? "Scheduled Start" : "Scheduled Date"}
                  </label>
                  <select
                    name="scheduledDate"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    disabled={capacityLoading || useHistoricalDateOverride}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
                  >
                    <option value="">No date</option>
                    {getAvailableDateOptions().length === 0 && (
                      <option value="" disabled>
                        No dates in next 12 months
                      </option>
                    )}
                    {getAvailableDateOptions().map((date) => (
                      <option key={date} value={date}>
                        {formatDateLabel(date)}
                      </option>
                    ))}
                  </select>
                  {capacityError && (
                    <p className="mt-1 text-xs text-red-600">{capacityError}</p>
                  )}
                  <label className="mt-2 flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={useHistoricalDateOverride}
                      onChange={(e) => setUseHistoricalDateOverride(e.target.checked)}
                      className="text-gray-900 focus:ring-gray-500"
                    />
                    Use a historical past date
                  </label>
                  {useHistoricalDateOverride && (
                    <>
                      <input
                        type="date"
                        value={historicalScheduledDate}
                        onChange={(e) => setHistoricalScheduledDate(e.target.value)}
                        className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Past dates bypass inventory checks. Future scheduling still uses
                        the availability picker above.
                      </p>
                    </>
                  )}
                </div>
                {isPodcastPlacement && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Scheduled End
                    </label>
                    <input
                      type="date"
                      name="scheduledEndDate"
                      value={scheduledEndDate}
                      onChange={(e) => setScheduledEndDate(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {isInterview && (
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    name="interviewScheduled"
                    className="text-gray-900 focus:ring-gray-500"
                  />
                  Interview Scheduled
                </label>
              )}

              {isPodcastRoll && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Committed Impressions
                  </label>
                  <input
                    type="number"
                    name="committedImpressions"
                    min={0}
                    step={1}
                    placeholder="e.g. 100000"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Copy Producer <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="radio"
                      name="copyProducer"
                      value="Us"
                      required
                      defaultChecked
                      className="text-gray-900 focus:ring-gray-500"
                    />
                    Us
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="radio"
                      name="copyProducer"
                      value="Client"
                      className="text-gray-900 focus:ring-gray-500"
                    />
                    Client
                  </label>
                </div>
              </div>

              {!isEvergreen && (
                <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Status <span className="text-red-500">*</span>
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as PlacementStatus)}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
                >
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                </div>
              )}

              {!isEvergreen && compatibleOnboardingRounds.length > 0 && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Onboarding Round
                  </label>
                  <select
                    name="onboardingRoundId"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
                  >
                    <option value="">None</option>
                    {compatibleOnboardingRounds.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label || r.id}
                        {` (${r.formType})`}
                        {r.complete ? "" : " (pending)"}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Notes
                </label>
                <textarea
                  name="notes"
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {submitting ? "Adding..." : "Add Placement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
