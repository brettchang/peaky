"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  OnboardingRound,
  PlacementStatus,
  PlacementType,
  Publication,
  PODCAST_PLACEMENT_TYPES,
  PODCAST_PUBLICATION,
  getDefaultPlacementStatus,
  getPlacementStatusesFor,
  isPodcastInterviewType,
} from "@/lib/types";

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

interface AddPlacementFormProps {
  campaignId: string;
  onboardingRounds?: OnboardingRound[];
}

export function AddPlacementForm({ campaignId, onboardingRounds }: AddPlacementFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<PlacementType>("Primary");
  const [publication, setPublication] = useState<Publication>("The Peak");
  const [status, setStatus] = useState<PlacementStatus>("New Campaign");

  const statusOptions = useMemo(
    () => getPlacementStatusesFor(type, publication),
    [type, publication]
  );

  function handleTypeChange(nextType: PlacementType) {
    setType(nextType);
    if (PODCAST_PLACEMENT_TYPES.includes(nextType)) {
      setPublication(PODCAST_PUBLICATION);
      setStatus(getDefaultPlacementStatus(nextType, PODCAST_PUBLICATION));
      return;
    }
    setStatus(getDefaultPlacementStatus(nextType, publication));
  }

  function handlePublicationChange(nextPublication: Publication) {
    setPublication(nextPublication);
    const nextType =
      nextPublication === PODCAST_PUBLICATION && !PODCAST_PLACEMENT_TYPES.includes(type)
        ? ":30 Pre-Roll"
        : type;
    if (nextType !== type) setType(nextType);
    setStatus(getDefaultPlacementStatus(nextType, nextPublication));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);

    const res = await fetch("/api/add-placement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId,
        type,
        publication,
        scheduledDate: formData.get("scheduledDate") || undefined,
        scheduledEndDate: formData.get("scheduledEndDate") || undefined,
        interviewScheduled:
          formData.get("interviewScheduled") === "on" ? true : undefined,
        copyProducer: formData.get("copyProducer"),
        status,
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
    router.refresh();
  }

  const isPodcastPlacement = publication === PODCAST_PUBLICATION;
  const isInterview = isPodcastInterviewType(type);

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
                  <input
                    type="date"
                    name="scheduledDate"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
                  />
                </div>
                {isPodcastPlacement && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Scheduled End
                    </label>
                    <input
                      type="date"
                      name="scheduledEndDate"
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

              {onboardingRounds && onboardingRounds.length > 0 && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Onboarding Round
                  </label>
                  <select
                    name="onboardingRoundId"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
                  >
                    <option value="">None</option>
                    {onboardingRounds.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label || r.id}
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
