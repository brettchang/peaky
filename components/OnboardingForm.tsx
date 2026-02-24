"use client";

import { useEffect, useRef, useState } from "react";
import type { DateRangeCapacity, Placement } from "@/lib/types";
import { DAILY_CAPACITY_LIMITS } from "@/lib/types";

interface OnboardingFormProps {
  campaignId: string;
  clientPortalId: string;
  roundId: string;
  roundLabel?: string;
  placements: Placement[];
  initialMessaging?: string;
  initialDesiredAction?: string;
  editable: boolean;
  submitted: boolean;
}

export function OnboardingForm({
  campaignId,
  clientPortalId,
  roundId,
  roundLabel,
  placements,
  initialMessaging,
  initialDesiredAction,
  editable,
  submitted,
}: OnboardingFormProps) {
  const placementsNeedingDates = placements.filter((p) => !p.scheduledDate);
  const [messaging, setMessaging] = useState(initialMessaging || "");
  const [desiredAction, setDesiredAction] = useState(initialDesiredAction || "");
  const [briefs, setBriefs] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const p of placements) {
      initial[p.id] = p.onboardingBrief || "";
    }
    return initial;
  });
  const [links, setLinks] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const p of placements) {
      initial[p.id] = p.linkToPlacement || "";
    }
    return initial;
  });
  const [logoUrls, setLogoUrls] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const p of placements) {
      if (p.logoUrl) initial[p.id] = p.logoUrl;
    }
    return initial;
  });
  const [imageUrls, setImageUrls] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const p of placements) {
      if (p.imageUrl) initial[p.id] = p.imageUrl;
    }
    return initial;
  });
  const [uploading, setUploading] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingDates, setLoadingDates] = useState(false);
  const [capacity, setCapacity] = useState<DateRangeCapacity | null>(null);
  const [selectedDates, setSelectedDates] = useState<Record<string, string>>({});
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [submittedNow, setSubmittedNow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const isReadOnly = !editable || submittedNow;

  useEffect(() => {
    if (placementsNeedingDates.length === 0) return;

    async function loadCapacity() {
      setError(null);
      setLoadingDates(true);
      try {
        const start = new Date();
        const end = new Date();
        end.setDate(end.getDate() + 90);

        const startDate = formatDateForInput(start);
        const endDate = formatDateForInput(end);

        const res = await fetch(
          `/api/schedule-capacity?startDate=${startDate}&endDate=${endDate}`
        );
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to load date availability");
        }
        const data: DateRangeCapacity = await res.json();
        setCapacity(data);
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load date availability"
        );
      } finally {
        setLoadingDates(false);
      }
    }

    loadCapacity();
  }, [placementsNeedingDates.length]);

  function updateBrief(placementId: string, value: string) {
    setBriefs((prev) => ({ ...prev, [placementId]: value }));
  }

  function updateLink(placementId: string, value: string) {
    setLinks((prev) => ({ ...prev, [placementId]: value }));
  }

  async function handleFileUpload(
    placementId: string,
    field: "logoUrl" | "imageUrl",
    file: File
  ) {
    setUploading((prev) => ({ ...prev, [`${placementId}-${field}`]: field }));
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("campaignId", campaignId);
      formData.append("placementId", placementId);
      formData.append("field", field);

      const res = await fetch("/api/upload-placement-asset", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      if (field === "logoUrl") {
        setLogoUrls((prev) => ({ ...prev, [placementId]: data.url }));
      } else {
        setImageUrls((prev) => ({ ...prev, [placementId]: data.url }));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to upload file. Please try again.");
    } finally {
      setUploading((prev) => ({ ...prev, [`${placementId}-${field}`]: null }));
    }
  }

  function getPayload() {
    return {
      campaignId,
      portalId: clientPortalId,
      roundId,
      messaging,
      desiredAction,
      placementBriefs: placements.map((p) => ({
        placementId: p.id,
        brief: briefs[p.id] || "",
        link: links[p.id] || "",
        scheduledDate: p.scheduledDate ? undefined : selectedDates[p.id] || undefined,
      })),
    };
  }

  function getAvailableDatesForPlacement(placement: Placement): { date: string; available: boolean }[] {
    if (!capacity) return [];

    const limit = DAILY_CAPACITY_LIMITS[placement.type];
    return capacity.days.map((day) => {
      if (limit === null) {
        return { date: day.date, available: true };
      }

      const slot = day.slots.find(
        (s) => s.publication === placement.publication && s.type === placement.type
      );

      const batchUsed = Object.entries(selectedDates).filter(([pid, selected]) => {
        if (pid === placement.id || selected !== day.date) return false;
        const p = placementsNeedingDates.find((candidate) => candidate.id === pid);
        return (
          p !== undefined &&
          p.publication === placement.publication &&
          p.type === placement.type
        );
      }).length;

      const serverAvailable = slot?.available ?? 0;
      return { date: day.date, available: serverAvailable - batchUsed > 0 };
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSavedMessage(null);
    try {
      const res = await fetch("/api/save-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getPayload()),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }
      setSavedMessage("Draft saved successfully.");
      setTimeout(() => setSavedMessage(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (placementsNeedingDates.length > 0) {
      if (loadingDates) {
        setError("Date availability is still loading. Please try again in a moment.");
        return;
      }

      if (!capacity) {
        setError("Unable to load date availability. Please refresh and try again.");
        return;
      }

      const missingDate = placementsNeedingDates.find((p) => !selectedDates[p.id]);
      if (missingDate) {
        setError("Please choose a date for each placement before submitting.");
        return;
      }
    }

    if (!messaging.trim() || !desiredAction.trim()) {
      setError("Please fill in both campaign questions before submitting.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/submit-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getPayload()),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit");
      }
      setSubmittedNow(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-900">
        {roundLabel || "Help us create your ad copy"}
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        Tell us about your campaign and we&apos;ll draft copy for {placements.length === 1 ? "this placement" : `these ${placements.length} placements`}.
      </p>

      {/* Read-only banner */}
      {!editable && (
        <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
          <p className="text-sm text-gray-600">
            Your responses have been submitted. Our team is working on your copy.
          </p>
        </div>
      )}

      {/* Submitted + still editable banner */}
      {submitted && editable && !submittedNow && (
        <div className="mt-4 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
          <p className="text-sm text-blue-700">
            Submitted! You can still edit until our team begins copywriting.
          </p>
        </div>
      )}

      {/* Just submitted confirmation */}
      {submittedNow && (
        <div className="mt-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3">
          <p className="text-sm text-green-700">
            Your brief has been submitted! Our team will begin drafting your copy shortly.
          </p>
        </div>
      )}

      {/* Campaign-level questions */}
      <div className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            What&apos;s the overall messaging for this campaign?
          </label>
          <textarea
            value={messaging}
            onChange={(e) => setMessaging(e.target.value)}
            readOnly={isReadOnly}
            placeholder="Describe your key messages, value proposition, and what makes your product/service unique..."
            rows={4}
            className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-500 focus:outline-none ${
              isReadOnly
                ? "border-gray-100 bg-gray-50 text-gray-600"
                : "border-gray-300 bg-white"
            }`}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            What&apos;s the desired action of Peak readers?
          </label>
          <textarea
            value={desiredAction}
            onChange={(e) => setDesiredAction(e.target.value)}
            readOnly={isReadOnly}
            placeholder="e.g., Sign up for a free trial, Visit our website, Download the report..."
            rows={3}
            className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-500 focus:outline-none ${
              isReadOnly
                ? "border-gray-100 bg-gray-50 text-gray-600"
                : "border-gray-300 bg-white"
            }`}
          />
        </div>
      </div>

      {/* Per-placement briefs */}
      {placements.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-gray-700">
            Per-Placement Details
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Provide a link, brief, and any required assets for each placement.
          </p>

          <div className="mt-3 space-y-4">
            {placements.map((p) => {
              const isPrimary = p.type === "Primary";
              return (
                <div
                  key={p.id}
                  className="rounded-lg border border-gray-100 bg-gray-50 p-4"
                >
                  <div className="mb-3 flex items-center gap-2 text-sm">
                    <span className="font-medium text-gray-900">{p.type}</span>
                    <span className="text-gray-400">&middot;</span>
                    <span className="text-gray-500">{p.publication}</span>
                    {p.scheduledDate && (
                      <>
                        <span className="text-gray-400">&middot;</span>
                        <span className="text-gray-500">
                          {new Date(
                            p.scheduledDate + "T00:00:00"
                          ).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </>
                    )}
                  </div>

                  {!p.scheduledDate && (
                    <div className="mb-3">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Placement Date
                      </label>
                      <select
                        value={selectedDates[p.id] || ""}
                        onChange={(e) =>
                          setSelectedDates((prev) => ({
                            ...prev,
                            [p.id]: e.target.value,
                          }))
                        }
                        disabled={isReadOnly || loadingDates || !capacity}
                        className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none ${
                          isReadOnly
                            ? "border-gray-100 bg-white/50 text-gray-600"
                            : "border-gray-200 bg-white"
                        }`}
                      >
                        <option value="">
                          {loadingDates
                            ? "Loading dates..."
                            : "Select placement date..."}
                        </option>
                        {getAvailableDatesForPlacement(p).map(({ date, available }) => (
                          <option key={date} value={date} disabled={!available}>
                            {formatDateShort(date)}
                            {!available ? " (full)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Link field */}
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Link URL
                    </label>
                    <input
                      type="url"
                      value={links[p.id] || ""}
                      onChange={(e) => updateLink(p.id, e.target.value)}
                      readOnly={isReadOnly}
                      placeholder="https://..."
                      className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-500 focus:outline-none ${
                        isReadOnly
                          ? "border-gray-100 bg-white/50 text-gray-600"
                          : "border-gray-200 bg-white"
                      }`}
                    />
                  </div>

                  {/* Brief */}
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Brief
                    </label>
                    <textarea
                      value={briefs[p.id] || ""}
                      onChange={(e) => updateBrief(p.id, e.target.value)}
                      readOnly={isReadOnly}
                      placeholder="Describe what you'd like for this placement..."
                      rows={2}
                      className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-500 focus:outline-none ${
                        isReadOnly
                          ? "border-gray-100 bg-white/50 text-gray-600"
                          : "border-gray-200 bg-white"
                      }`}
                    />
                  </div>

                  {/* Primary-only: logo + story image uploads */}
                  {isPrimary && (
                    <div className="grid grid-cols-2 gap-3">
                      {/* Logo upload */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Logo
                        </label>
                        {logoUrls[p.id] ? (
                          <div className="relative">
                            <img
                              src={logoUrls[p.id]}
                              alt="Logo"
                              className="h-16 rounded border border-gray-200 bg-white object-contain p-1"
                            />
                            {!isReadOnly && (
                              <button
                                onClick={() => {
                                  setLogoUrls((prev) => {
                                    const next = { ...prev };
                                    delete next[p.id];
                                    return next;
                                  });
                                }}
                                className="mt-1 text-xs text-gray-500 hover:text-gray-700"
                              >
                                Replace
                              </button>
                            )}
                          </div>
                        ) : (
                          <>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              ref={(el) => {
                                fileRefs.current[`${p.id}-logo`] = el;
                              }}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleFileUpload(p.id, "logoUrl", file);
                                e.target.value = "";
                              }}
                            />
                            <button
                              onClick={() =>
                                fileRefs.current[`${p.id}-logo`]?.click()
                              }
                              disabled={
                                isReadOnly ||
                                !!uploading[`${p.id}-logoUrl`]
                              }
                              className="rounded-lg border border-dashed border-gray-300 bg-white px-3 py-2 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-700 disabled:opacity-50"
                            >
                              {uploading[`${p.id}-logoUrl`]
                                ? "Uploading..."
                                : "Upload Logo"}
                            </button>
                          </>
                        )}
                      </div>

                      {/* Story image upload */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Story Image{" "}
                          <span className="font-normal text-gray-400">
                            (600 x 340)
                          </span>
                        </label>
                        {imageUrls[p.id] ? (
                          <div className="relative">
                            <img
                              src={imageUrls[p.id]}
                              alt="Story image"
                              className="h-16 rounded border border-gray-200 bg-white object-cover"
                            />
                            {!isReadOnly && (
                              <button
                                onClick={() => {
                                  setImageUrls((prev) => {
                                    const next = { ...prev };
                                    delete next[p.id];
                                    return next;
                                  });
                                }}
                                className="mt-1 text-xs text-gray-500 hover:text-gray-700"
                              >
                                Replace
                              </button>
                            )}
                          </div>
                        ) : (
                          <>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              ref={(el) => {
                                fileRefs.current[`${p.id}-image`] = el;
                              }}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file)
                                  handleFileUpload(p.id, "imageUrl", file);
                                e.target.value = "";
                              }}
                            />
                            <button
                              onClick={() =>
                                fileRefs.current[`${p.id}-image`]?.click()
                              }
                              disabled={
                                isReadOnly ||
                                !!uploading[`${p.id}-imageUrl`]
                              }
                              className="rounded-lg border border-dashed border-gray-300 bg-white px-3 py-2 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-700 disabled:opacity-50"
                            >
                              {uploading[`${p.id}-imageUrl`]
                                ? "Uploading..."
                                : "Upload Image"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Error */}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {/* Saved message */}
      {savedMessage && (
        <p className="mt-4 text-sm text-green-600">{savedMessage}</p>
      )}

      {/* Actions */}
      {editable && !submittedNow && (
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || submitting}
            className="rounded-lg border border-gray-300 bg-white px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Draft"}
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || submitting}
            className="rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit"}
          </button>
        </div>
      )}
    </div>
  );
}

function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
