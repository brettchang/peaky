"use client";

import { useState } from "react";
import type { Placement } from "@/lib/types";

interface OnboardingFormProps {
  campaignId: string;
  clientPortalId: string;
  placements: Placement[];
  initialMessaging?: string;
  initialDesiredAction?: string;
  editable: boolean;
  submitted: boolean;
}

export function OnboardingForm({
  campaignId,
  clientPortalId,
  placements,
  initialMessaging,
  initialDesiredAction,
  editable,
  submitted,
}: OnboardingFormProps) {
  const [messaging, setMessaging] = useState(initialMessaging || "");
  const [desiredAction, setDesiredAction] = useState(initialDesiredAction || "");
  const [briefs, setBriefs] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const p of placements) {
      initial[p.id] = p.onboardingBrief || "";
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [submittedNow, setSubmittedNow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateBrief(placementId: string, value: string) {
    setBriefs((prev) => ({ ...prev, [placementId]: value }));
  }

  function getPayload() {
    return {
      campaignId,
      portalId: clientPortalId,
      messaging,
      desiredAction,
      placementBriefs: placements.map((p) => ({
        placementId: p.id,
        brief: briefs[p.id] || "",
      })),
    };
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
        Help us create your ad copy
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        Tell us about your campaign and we&apos;ll draft copy for each placement.
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
            readOnly={!editable || submittedNow}
            placeholder="Describe your key messages, value proposition, and what makes your product/service unique..."
            rows={4}
            className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-500 focus:outline-none ${
              !editable || submittedNow
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
            readOnly={!editable || submittedNow}
            placeholder="e.g., Sign up for a free trial, Visit our website, Download the report..."
            rows={3}
            className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-500 focus:outline-none ${
              !editable || submittedNow
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
            Per-Placement Briefs
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Optionally provide specific direction for each placement.
          </p>

          <div className="mt-3 space-y-4">
            {placements.map((p) => (
              <div
                key={p.id}
                className="rounded-lg border border-gray-100 bg-gray-50 p-4"
              >
                <div className="mb-2 flex items-center gap-2 text-sm">
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
                <textarea
                  value={briefs[p.id] || ""}
                  onChange={(e) => updateBrief(p.id, e.target.value)}
                  readOnly={!editable || submittedNow}
                  placeholder="Describe what you'd like for this placement..."
                  rows={2}
                  className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-500 focus:outline-none ${
                    !editable || submittedNow
                      ? "border-gray-100 bg-white/50 text-gray-600"
                      : "border-gray-200 bg-white"
                  }`}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      )}

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
