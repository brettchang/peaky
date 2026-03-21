"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { DateRangeCapacity, OnboardingFormType, Placement } from "@/lib/types";
import {
  getPlacementAvailableCapacityDates,
  getTodayDateKey,
} from "@/lib/schedule-capacity";

interface OnboardingFormProps {
  campaignId: string;
  clientPortalId: string;
  roundId: string;
  roundLabel?: string;
  formType: OnboardingFormType;
  placements: Placement[];
  clientProvidesCopy?: boolean;
  initialCampaignObjective?: string;
  initialKeyMessage?: string;
  initialTalkingPoints?: string;
  initialCallToAction?: string;
  initialTargetAudience?: string;
  initialToneGuidelines?: string;
  editable: boolean;
  submitted: boolean;
  adminMode?: boolean;
  backHref?: string;
  backLabel?: string;
}

interface PlacementBriefDraft {
  placementId: string;
  brief: string;
  copy: string;
  link?: string;
  scheduledDate?: string;
  imageUrl?: string;
  logoUrl?: string;
}

export function OnboardingForm({
  campaignId,
  clientPortalId,
  roundId,
  roundLabel,
  formType,
  placements,
  clientProvidesCopy = false,
  initialCampaignObjective,
  initialKeyMessage,
  initialTalkingPoints,
  initialCallToAction,
  initialTargetAudience,
  initialToneGuidelines,
  editable,
  submitted,
  adminMode = false,
  backHref,
  backLabel,
}: OnboardingFormProps) {
  const [campaignObjective, setCampaignObjective] = useState(initialCampaignObjective || "");
  const [keyMessage, setKeyMessage] = useState(initialKeyMessage || "");
  const [talkingPoints, setTalkingPoints] = useState(initialTalkingPoints || "");
  const [callToAction, setCallToAction] = useState(initialCallToAction || "");
  const [targetAudience, setTargetAudience] = useState(initialTargetAudience || "");
  const [toneGuidelines, setToneGuidelines] = useState(initialToneGuidelines || "");
  const [additionalNotes, setAdditionalNotes] = useState(initialToneGuidelines || "");
  const [placementBriefs, setPlacementBriefs] = useState<PlacementBriefDraft[]>(
    () =>
      placements.map((placement) => ({
        placementId: placement.id,
        brief: placement.onboardingBrief || "",
        copy: placement.currentCopy || "",
        link: placement.linkToPlacement || "",
        scheduledDate: placement.scheduledDate,
        imageUrl: placement.imageUrl || "",
        logoUrl: placement.logoUrl || "",
      }))
  );
  const [capacityDays, setCapacityDays] = useState<DateRangeCapacity["days"]>([]);
  const [capacityLoading, setCapacityLoading] = useState(false);
  const [capacityError, setCapacityError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [submittedNow, setSubmittedNow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReadOnly = !editable || submittedNow;
  const isPodcastForm = formType === "podcast";
  const placementById = useMemo(
    () => new Map(placements.map((placement) => [placement.id, placement])),
    [placements]
  );
  const todayKey = useMemo(() => getTodayDateKey(), []);

  useEffect(() => {
    if (placements.length === 0) return;

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
    end.setDate(end.getDate() + 30);

    setCapacityLoading(true);
    setCapacityError(null);

    fetch(`/api/schedule-capacity?startDate=${toDateKey(start)}&endDate=${toDateKey(end)}`)
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
        setCapacityError(err instanceof Error ? err.message : "Failed to load available dates");
      })
      .finally(() => {
        if (cancelled) return;
        setCapacityLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [placements.length]);

  function getPayload() {
    const resolvedAdditionalNotes = additionalNotes.trim();
    return {
      campaignId,
      portalId: clientPortalId,
      roundId,
      placementIds: placements.map((p) => p.id),
      campaignObjective,
      keyMessage: isPodcastForm ? keyMessage : campaignObjective,
      talkingPoints: isPodcastForm ? talkingPoints : resolvedAdditionalNotes,
      callToAction,
      targetAudience: isPodcastForm ? targetAudience : resolvedAdditionalNotes,
      toneGuidelines: isPodcastForm ? toneGuidelines : resolvedAdditionalNotes,
      admin: adminMode,
      placementBriefs: placementBriefs.map((entry) => ({
        ...entry,
        scheduledDate: entry.scheduledDate?.trim() ? entry.scheduledDate : undefined,
        link: entry.link?.trim() ? entry.link : undefined,
        imageUrl: entry.imageUrl?.trim() ? entry.imageUrl : undefined,
        logoUrl: entry.logoUrl?.trim() ? entry.logoUrl : undefined,
      })),
    };
  }

  function updatePlacementBriefDraft(
    placementId: string,
    updater: (entry: PlacementBriefDraft) => PlacementBriefDraft
  ) {
    setPlacementBriefs((prev) =>
      prev.map((entry) =>
        entry.placementId === placementId ? updater(entry) : entry
      )
    );
  }

  function setPlacementBrief(placementId: string, brief: string) {
    updatePlacementBriefDraft(placementId, (entry) => ({ ...entry, brief }));
  }

  function setPlacementCopy(placementId: string, copy: string) {
    updatePlacementBriefDraft(placementId, (entry) => ({ ...entry, copy }));
  }

  function setPlacementLink(placementId: string, link: string) {
    updatePlacementBriefDraft(placementId, (entry) => ({
      ...entry,
      link: link || undefined,
    }));
  }

  function setPlacementAsset(
    placementId: string,
    field: "imageUrl" | "logoUrl",
    value: string
  ) {
    updatePlacementBriefDraft(placementId, (entry) => ({
      ...entry,
      [field]: value || undefined,
    }));
  }

  function setPlacementScheduledDate(placementId: string, scheduledDate: string) {
    updatePlacementBriefDraft(placementId, (entry) => ({
      ...entry,
      scheduledDate: scheduledDate || undefined,
    }));
  }

  function getSelectedDate(placementId: string): string {
    return (
      placementBriefs.find((entry) => entry.placementId === placementId)?.scheduledDate || ""
    );
  }

  function getPlacementDraft(placementId: string): PlacementBriefDraft | undefined {
    return placementBriefs.find((entry) => entry.placementId === placementId);
  }

  function getAssignedCountForDate(
    date: string,
    placement: Placement,
    excludePlacementId?: string
  ): number {
    return placementBriefs.filter((entry) => {
      if (!entry.scheduledDate || entry.scheduledDate !== date) return false;
      if (excludePlacementId && entry.placementId === excludePlacementId) return false;
      const candidate = placementById.get(entry.placementId);
      return (
        candidate &&
        candidate.type === placement.type &&
        candidate.publication === placement.publication
      );
    }).length;
  }

  function getAvailableDateOptions(placement: Placement): string[] {
    return getPlacementAvailableCapacityDates({
      capacityDays,
      placement,
      todayKey,
      getReservedCount: (date) =>
        getAssignedCountForDate(date, placement, placement.id),
    });
  }

  function formatDateLabel(date: string): string {
    return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
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

  async function handleAssetUpload(
    placementId: string,
    field: "logoUrl" | "imageUrl",
    file: File
  ) {
    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("campaignId", campaignId);
      formData.append("placementId", placementId);
      formData.append("field", field);
      if (!adminMode) {
        formData.append("clientId", clientPortalId);
      }

      const res = await fetch("/api/upload-placement-asset", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const data = await res.json();
      setPlacementAsset(placementId, field, String(data.url || ""));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (clientProvidesCopy) {
      const incompletePlacements = placements.filter((placement) => {
        const draft = getPlacementDraft(placement.id);
        if (!draft?.copy?.trim()) return true;
        if (!isPodcastForm && !draft?.link?.trim()) return true;
        if (placement.type === "Primary" && (!draft?.imageUrl?.trim() || !draft?.logoUrl?.trim())) {
          return true;
        }
        return false;
      });
      if (incompletePlacements.length > 0) {
        setError(
          "Please complete the copy for each placement, add links for newsletter placements, and upload logo/image assets for Primary placements before submitting."
        );
        return;
      }
    }

    const missingPodcastFields =
      !campaignObjective.trim() ||
      !keyMessage.trim() ||
      !talkingPoints.trim() ||
      !callToAction.trim() ||
      !targetAudience.trim() ||
      !toneGuidelines.trim();
    const missingNewsletterFields = !campaignObjective.trim() || !callToAction.trim();
    if (
      !clientProvidesCopy &&
      ((isPodcastForm && missingPodcastFields) || (!isPodcastForm && missingNewsletterFields))
    ) {
      setError(
        isPodcastForm
          ? "Please complete all fields before submitting."
          : "Please complete the objective and call-to-action fields before submitting."
      );
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
      <Link
        href={backHref || `/portal/${clientPortalId}`}
        className="mb-3 inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
      >
        &larr; {backLabel || "Back to portal"}
      </Link>
      <h2 className="text-lg font-semibold text-gray-900">{roundLabel || "Onboarding Script Form"}</h2>
      <p className="mt-1 text-sm text-gray-500">
        {clientProvidesCopy
          ? `Add the final copy, destination links, and any required creative assets for your ${placements.length} ${
              placements.length === 1 ? "placement." : "placements."
            }`
          : isPodcastForm
          ? "Share your script direction and we&apos;ll draft host-read copy."
          : `Share your newsletter ad direction and we'll draft placement copy for your ${placements.length} ${
              placements.length === 1 ? "placement." : "placements."
            }`}
      </p>

      {!editable && (
        <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
          <p className="text-sm text-gray-600">
            {clientProvidesCopy
              ? "Your form has been submitted."
              : "Your responses have been submitted. Our team is working on your copy."}
          </p>
        </div>
      )}

      {submitted && editable && !submittedNow && (
        <div className="mt-4 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
          <p className="text-sm text-blue-700">
            {adminMode
              ? "This form was already submitted. Admin edits here will update the saved onboarding answers."
              : clientProvidesCopy
                ? "Submitted! You can still edit until the form is locked."
                : "Submitted! You can still edit until our team begins copywriting."}
          </p>
        </div>
      )}

      {submittedNow && (
        <div className="mt-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3">
          <p className="text-sm text-green-700">
            {clientProvidesCopy
              ? "Your campaign form has been submitted."
              : "Your onboarding script form has been submitted."}
          </p>
        </div>
      )}

      {!clientProvidesCopy && <div className="mt-6 space-y-4">
        <FormField
          label={
            isPodcastForm
              ? "Campaign Objective"
              : "What do you want to accomplish with this advertisement (be specific)?"
          }
          value={campaignObjective}
          onChange={setCampaignObjective}
          readOnly={isReadOnly}
          placeholder={
            isPodcastForm
              ? "What outcome do you want from this campaign?"
              : "Describe the exact outcome you want from this ad."
          }
          rows={3}
        />
        <FormField
          label={
            isPodcastForm
              ? "Call to Action"
              : "What's your desired call to action?"
          }
          value={callToAction}
          onChange={setCallToAction}
          readOnly={isReadOnly}
          placeholder={
            isPodcastForm
              ? "What should listeners do next?"
              : "What action should readers take after seeing this ad?"
          }
          rows={2}
        />
        {!isPodcastForm && (
          <FormField
            label="Is there anything else we should know?"
            value={additionalNotes}
            onChange={setAdditionalNotes}
            readOnly={isReadOnly}
            placeholder="Any extra context, preferences, or constraints?"
            rows={4}
          />
        )}
        {isPodcastForm && (
          <>
            <FormField
              label="Key Message"
              value={keyMessage}
              onChange={setKeyMessage}
              readOnly={isReadOnly}
              placeholder="What core message should listeners remember?"
              rows={3}
            />
            <FormField
              label="Talking Points"
              value={talkingPoints}
              onChange={setTalkingPoints}
              readOnly={isReadOnly}
              placeholder="List key points, claims, differentiators, or proof points."
              rows={4}
            />
            <FormField
              label="Target Audience"
              value={targetAudience}
              onChange={setTargetAudience}
              readOnly={isReadOnly}
              placeholder="Who are you trying to reach?"
              rows={3}
            />
            <FormField
              label="Tone / Brand Guidelines"
              value={toneGuidelines}
              onChange={setToneGuidelines}
              readOnly={isReadOnly}
              placeholder="Any voice, compliance, or brand style guidance for the host read?"
              rows={4}
            />
          </>
        )}
      </div>}

      {placements.length > 0 && (
        <div className="mt-8 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">
            {clientProvidesCopy ? "Placements" : "Placement-Specific Notes"}
          </h3>
          {!clientProvidesCopy && (
            <p className="text-sm text-gray-500">
              Add context per placement (optional), such as angle, audience, or any placement-level notes.
            </p>
          )}
          <p className="text-sm text-gray-500">
            {clientProvidesCopy
              ? "Pick a preferred run date if needed, then add the final copy and required placement assets."
              : "Optional: pick a preferred run date from the available dates in the next 30 days."}
          </p>
          {capacityLoading && (
            <p className="text-sm text-gray-500">Loading available dates...</p>
          )}
          {capacityError && (
            <p className="text-sm text-red-600">{capacityError}</p>
          )}
          <div className="space-y-4">
            {placements.map((placement) => (
              <div key={placement.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm font-medium text-gray-900">
                  {placement.type} · {placement.publication}
                </p>
                {placement.scheduledDate && (
                  <p className="mt-1 text-xs text-gray-500">
                    Scheduled{" "}
                    {formatDateLabel(placement.scheduledDate)}
                  </p>
                )}
                {!placement.scheduledDate && (
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-700">
                      Preferred Run Date <span className="text-gray-500 font-normal">(optional)</span>
                    </label>
                    <select
                      value={getSelectedDate(placement.id)}
                      onChange={(e) => setPlacementScheduledDate(placement.id, e.target.value)}
                      disabled={
                        isReadOnly ||
                        capacityLoading ||
                        getAvailableDateOptions(placement).length === 0
                      }
                      className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none ${
                        isReadOnly
                          ? "border-gray-100 bg-white text-gray-600"
                          : "border-gray-300 bg-white"
                      }`}
                    >
                      <option value="">No preferred date</option>
                      {getAvailableDateOptions(placement).length === 0 && (
                        <option value="" disabled>
                          No available dates in the next 30 days
                        </option>
                      )}
                      {getAvailableDateOptions(placement).map((date) => (
                        <option key={date} value={date}>
                          {formatDateLabel(date)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {clientProvidesCopy ? (
                  <div className="mt-3 space-y-3">
                    <textarea
                      value={getPlacementDraft(placement.id)?.copy || ""}
                      onChange={(e) => setPlacementCopy(placement.id, e.target.value)}
                      readOnly={isReadOnly}
                      placeholder={
                        isPodcastForm
                          ? "Paste the final script for this placement."
                          : "Paste the final copy for this placement."
                      }
                      rows={6}
                      className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-500 focus:outline-none ${
                        isReadOnly
                          ? "border-gray-100 bg-white text-gray-600"
                          : "border-gray-300 bg-white"
                      }`}
                    />
                    {!isPodcastForm && (
                      <input
                        type="url"
                        value={getPlacementDraft(placement.id)?.link || ""}
                        onChange={(e) => setPlacementLink(placement.id, e.target.value)}
                        readOnly={isReadOnly}
                        placeholder="Destination link for this placement"
                        className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-500 focus:outline-none ${
                          isReadOnly
                            ? "border-gray-100 bg-white text-gray-600"
                            : "border-gray-300 bg-white"
                        }`}
                      />
                    )}
                    {placement.type === "Primary" && (
                      <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-3">
                        <p className="text-xs text-gray-600">
                          Primary placements require both a logo and a 600x340 image.
                        </p>
                        <label className="block text-sm text-gray-700">
                          Logo
                          <input
                            type="file"
                            accept="image/*"
                            disabled={isReadOnly || saving}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void handleAssetUpload(placement.id, "logoUrl", file);
                              e.currentTarget.value = "";
                            }}
                            className="mt-1 block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-gray-200 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-gray-300"
                          />
                          {getPlacementDraft(placement.id)?.logoUrl ? (
                            <a
                              href={getPlacementDraft(placement.id)?.logoUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-block text-xs text-blue-700 hover:underline"
                            >
                              View uploaded logo
                            </a>
                          ) : (
                            <span className="mt-1 block text-xs text-red-600">Logo required</span>
                          )}
                        </label>
                        <label className="block text-sm text-gray-700">
                          Image
                          <input
                            type="file"
                            accept="image/*"
                            disabled={isReadOnly || saving}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void handleAssetUpload(placement.id, "imageUrl", file);
                              e.currentTarget.value = "";
                            }}
                            className="mt-1 block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-gray-200 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-gray-300"
                          />
                          {getPlacementDraft(placement.id)?.imageUrl ? (
                            <a
                              href={getPlacementDraft(placement.id)?.imageUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-block text-xs text-blue-700 hover:underline"
                            >
                              View uploaded image
                            </a>
                          ) : (
                            <span className="mt-1 block text-xs text-red-600">Image required</span>
                          )}
                        </label>
                      </div>
                    )}
                  </div>
                ) : (
                  <textarea
                    value={getPlacementDraft(placement.id)?.brief || ""}
                    onChange={(e) => setPlacementBrief(placement.id, e.target.value)}
                    readOnly={isReadOnly}
                    placeholder="Any notes specific to this placement?"
                    rows={3}
                    className={`mt-3 w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-500 focus:outline-none ${
                      isReadOnly
                        ? "border-gray-100 bg-white text-gray-600"
                        : "border-gray-300 bg-white"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {savedMessage && <p className="mt-4 text-sm text-green-600">{savedMessage}</p>}

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
            {submitting ? "Submitting..." : adminMode ? "Save as Submitted" : "Submit"}
          </button>
        </div>
      )}
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  readOnly,
  placeholder,
  rows,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  placeholder: string;
  rows: number;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        placeholder={placeholder}
        rows={rows}
        className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-500 focus:outline-none ${
          readOnly ? "border-gray-100 bg-gray-50 text-gray-600" : "border-gray-300 bg-white"
        }`}
      />
    </div>
  );
}
