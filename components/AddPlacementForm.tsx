"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OnboardingRound } from "@/lib/types";

const PLACEMENT_TYPES = [
  "Primary",
  "Secondary",
  "Peak Picks",
  "Beehiv",
  "Smart Links",
  "BLS",
  "Podcast Ad",
] as const;

const PUBLICATIONS = ["The Peak", "Peak Money"] as const;

const STATUSES = [
  "New Campaign",
  "Copywriting in Progress",
  "Peak Team Review Complete",
  "Sent for Approval",
  "Approved",
] as const;

interface AddPlacementFormProps {
  campaignId: string;
  onboardingRounds?: OnboardingRound[];
}

export function AddPlacementForm({ campaignId, onboardingRounds }: AddPlacementFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        type: formData.get("type"),
        publication: formData.get("publication"),
        scheduledDate: formData.get("scheduledDate") || undefined,
        copyProducer: formData.get("copyProducer"),
        status: formData.get("status"),
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
              <h2 className="text-lg font-semibold text-gray-900">
                Add Placement
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Two-column row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="type"
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
                  >
                    <option value="">Select type...</option>
                    {PLACEMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Publication <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="publication"
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
                  >
                    <option value="">Select publication...</option>
                    {PUBLICATIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Scheduled date */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Scheduled Date
                </label>
                <input
                  type="date"
                  name="scheduledDate"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
                />
              </div>

              {/* Copy producer */}
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

              {/* Status */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Status <span className="text-red-500">*</span>
                </label>
                <select
                  name="status"
                  required
                  defaultValue="New Campaign"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              {/* Onboarding Round */}
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
                        {r.label || r.id}{r.complete ? "" : " (pending)"}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Notes */}
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

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

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
