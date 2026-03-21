"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  OnboardingRound,
  BillingOnboarding,
  Placement,
  OnboardingFormType,
  getOnboardingFormTypeForPlacement,
} from "@/lib/types";
import { CampaignOnboardingOverrides } from "@/lib/onboarding-overrides";
import { getBlobViewUrl } from "@/lib/blob-url";

function cadenceLabel(cadence: BillingOnboarding["invoiceCadence"]): string {
  if (!cadence) return "Completed";
  switch (cadence.type) {
    case "lump-sum":
      return `Lump Sum (${cadence.paymentTerms})`;
    case "equal-monthly":
      return `Equal Monthly — $${cadence.monthlyAmount.toLocaleString()}/mo × ${cadence.numberOfMonths}`;
    case "per-month-usage":
      return "Per-Month Usage";
  }
}

function placementLabel(p: Placement): string {
  const date = p.scheduledDate
    ? ` — ${new Date(`${p.scheduledDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : "";
  return `${p.type}${date}`;
}

function placementAssignmentOptionLabel(p: Placement): string {
  const title = p.name?.trim() || p.type;
  if (!p.scheduledDate) return title;

  const start = new Date(`${p.scheduledDate}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const end =
    p.scheduledEndDate && p.scheduledEndDate > p.scheduledDate
      ? new Date(`${p.scheduledEndDate}T00:00:00`).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : null;

  return `${title} - ${end ? `${start} to ${end}` : start}`;
}

function formTypeLabel(type: OnboardingFormType): string {
  return type === "podcast" ? "Podcast Form" : "Newsletter Form";
}

export function OnboardingStatus({
  rounds,
  campaignId,
  billingOnboarding,
  placements = [],
  onboardingSubmittedAt,
  portalUrl,
  overrides,
}: {
  rounds: OnboardingRound[];
  campaignId: string;
  billingOnboarding?: BillingOnboarding;
  placements?: Placement[];
  onboardingSubmittedAt?: string;
  portalUrl?: string;
  overrides?: CampaignOnboardingOverrides;
}) {
  const router = useRouter();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showNewRound, setShowNewRound] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newFormType, setNewFormType] = useState<OnboardingFormType>("newsletter");
  const [creating, setCreating] = useState(false);
  const [editingRoundId, setEditingRoundId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [savingRoundId, setSavingRoundId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [uploadingBilling, setUploadingBilling] = useState(false);
  const [overridingId, setOverridingId] = useState<string | null>(null);
  const billingFileRef = useRef<HTMLInputElement | null>(null);

  const unassigned = placements.filter((p) => !p.onboardingRoundId);

  async function handleBillingUpload(file: File) {
    setUploadingBilling(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("campaignId", campaignId);
      formData.append("type", "billing");

      const res = await fetch("/api/upload-onboarding-doc", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setUploadingBilling(false);
    }
  }

  async function handleCopy(id: string, link: string) {
    await navigator.clipboard.writeText(link);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleCreateRound() {
    setCreating(true);
    try {
      const res = await fetch("/api/create-onboarding-round", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          label: newLabel.trim() || undefined,
          formType: newFormType,
        }),
      });
      if (res.ok) {
        setNewLabel("");
        setNewFormType("newsletter");
        setShowNewRound(false);
        router.refresh();
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleAssign(placementId: string, roundId: string | null) {
    setAssigning(placementId);
    try {
      const res = await fetch("/api/update-placement-round", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          placementId,
          onboardingRoundId: roundId,
        }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setAssigning(null);
    }
  }

  async function handleRenameRound(roundId: string) {
    setSavingRoundId(roundId);
    try {
      const res = await fetch("/api/update-onboarding-round", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          roundId,
          label: editingLabel.trim() || undefined,
        }),
      });
      if (res.ok) {
        setEditingRoundId(null);
        setEditingLabel("");
        router.refresh();
      }
    } finally {
      setSavingRoundId(null);
    }
  }

  async function handleOverride(type: "round" | "billing", roundId?: string) {
    const reason = window.prompt(
      "Explain why you are overriding this onboarding form (required)."
    );
    if (!reason || !reason.trim()) return;

    const id = type === "round" ? roundId ?? "round" : "billing";
    setOverridingId(id);
    try {
      const res = await fetch("/api/override-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          type,
          roundId,
          reason: reason.trim(),
        }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setOverridingId(null);
    }
  }

  async function handleRemoveOverride(type: "round" | "billing", roundId?: string) {
    const id = type === "round" ? roundId ?? "round" : "billing";
    setOverridingId(id);
    try {
      const res = await fetch("/api/override-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          type,
          roundId,
          action: "remove",
        }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setOverridingId(null);
    }
  }

  return (
    <div className="mb-8 space-y-3">
      {/* Copy Onboarding section */}
      <h3 className="text-sm font-semibold text-gray-700">Copy Onboarding</h3>

      {/* Native onboarding submitted */}
      {onboardingSubmittedAt && (
        <div className="rounded-lg border border-green-200 bg-green-50">
          <div className="flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-white">
                {"\u2713"}
              </span>
              <div>
                <p className="text-sm font-medium text-green-800">
                  Native onboarding submitted
                </p>
                <p className="text-xs text-gray-500">
                  {new Date(onboardingSubmittedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding rounds */}
      {rounds.map((round) => {
        const roundPlacements = placements.filter(
          (p) => p.onboardingRoundId === round.id
        );
        const compatibleUnassigned = unassigned.filter(
          (p) => getOnboardingFormTypeForPlacement(p) === round.formType
        );

        return (
          <div
            key={round.id}
            className={`rounded-lg border ${
              round.complete
                ? "border-green-200 bg-green-50"
                : "border-amber-200 bg-amber-50"
            }`}
          >
            <div className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${
                    round.complete ? "bg-green-500" : "bg-amber-400"
                  }`}
                >
                  {round.complete ? "\u2713" : "!"}
                </span>
                <div>
                  {editingRoundId === round.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={editingLabel}
                        onChange={(e) => setEditingLabel(e.target.value)}
                        className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900"
                        placeholder="Round name"
                      />
                      <button
                        onClick={() => handleRenameRound(round.id)}
                        disabled={savingRoundId === round.id}
                        className="rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                      >
                        {savingRoundId === round.id ? "Saving..." : "Save"}
                      </button>
                      <button
                        onClick={() => {
                          setEditingRoundId(null);
                          setEditingLabel("");
                        }}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        className={`text-sm font-medium ${
                          round.complete ? "text-green-800" : "text-amber-800"
                        }`}
                      >
                        {round.label || round.id}
                      </p>
                      <button
                        onClick={() => {
                          setEditingRoundId(round.id);
                          setEditingLabel(round.label || "");
                        }}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Rename
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-gray-500">
                    {round.complete ? "Submitted" : "Waiting on client"}
                  </p>
                  <p className="text-xs text-gray-500">{formTypeLabel(round.formType)}</p>
                  {overrides?.rounds?.[round.id] && (
                    <p className="text-xs text-fuchsia-700">
                      Override: {overrides.rounds[round.id].reason}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-2">
                {portalUrl && (
                  <div className="flex flex-col items-end gap-2">
                    {round.complete ? (
                      <button
                        onClick={() => handleCopy(round.id, `${portalUrl}/${campaignId}`)}
                        className="rounded-lg border border-green-300 bg-white px-4 py-2 text-sm font-medium text-green-800 hover:bg-green-100"
                      >
                        {copiedId === round.id ? "Copied!" : "Copy Portal Link"}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleCopy(round.id, `${portalUrl}/${campaignId}`)}
                        className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
                      >
                        {copiedId === round.id ? "Copied!" : "Copy Portal Link"}
                      </button>
                    )}
                  </div>
                )}
                <button
                  onClick={() => router.push(`/dashboard/${campaignId}/onboarding/${round.id}`)}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  Edit Responses
                </button>
                {!round.complete && (
                  <button
                    onClick={() => handleOverride("round", round.id)}
                    disabled={overridingId === round.id}
                    className="rounded-lg border border-fuchsia-300 bg-white px-4 py-2 text-sm font-medium text-fuchsia-800 hover:bg-fuchsia-100 disabled:opacity-50"
                  >
                    {overridingId === round.id
                      ? "Overriding..."
                      : "Override Complete"}
                  </button>
                )}
                {round.complete && overrides?.rounds?.[round.id] && (
                  <button
                    onClick={() => handleRemoveOverride("round", round.id)}
                    disabled={overridingId === round.id}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                  >
                    {overridingId === round.id ? "Removing..." : "Remove Override"}
                  </button>
                )}
              </div>
            </div>

            {/* Linked placements */}
            {roundPlacements.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-5 pb-3">
                {roundPlacements.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-medium text-gray-700"
                  >
                    {placementLabel(p)}
                    <button
                      onClick={() => handleAssign(p.id, null)}
                      disabled={assigning === p.id}
                      className="ml-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                      title="Unassign from round"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Assign unassigned placements */}
            {compatibleUnassigned.length > 0 && (
              <div className="px-5 pb-3">
                <select
                  className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      handleAssign(e.target.value, round.id);
                    }
                  }}
                  disabled={assigning !== null}
                >
                  <option value="">
                    Assign a {round.formType === "podcast" ? "podcast" : "newsletter"} placement...
                  </option>
                  {compatibleUnassigned.map((p) => (
                    <option key={p.id} value={p.id}>
                      {placementAssignmentOptionLabel(p)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        );
      })}

      {showNewRound ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-5 py-3">
          <input
            type="text"
            placeholder="Round label (e.g. Q2 Refresh)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
          />
          <select
            value={newFormType}
            onChange={(e) => setNewFormType(e.target.value as OnboardingFormType)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
          >
            <option value="newsletter">Newsletter Form</option>
            <option value="podcast">Podcast Form</option>
          </select>
          <button
            onClick={handleCreateRound}
            disabled={creating}
            className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create"}
          </button>
          <button
            onClick={() => {
              setShowNewRound(false);
              setNewLabel("");
              setNewFormType("newsletter");
            }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowNewRound(true)}
          className="w-full rounded-lg border border-dashed border-gray-300 px-5 py-3 text-sm font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700"
        >
          + New Round
        </button>
      )}

      {/* Unassigned placements note */}
      {unassigned.length > 0 && (
        <p className="text-xs text-gray-400">
          {unassigned.length} placement{unassigned.length !== 1 ? "s" : ""} not
          assigned to a round
        </p>
      )}

      {/* Billing Onboarding section */}
      {billingOnboarding && (
        <>
          <h3 className="text-sm font-semibold text-gray-700 pt-2">Billing Onboarding</h3>

          <div
            className={`flex items-center justify-between rounded-lg border px-5 py-3 ${
              billingOnboarding.complete
                ? "border-green-200 bg-green-50"
                : "border-amber-200 bg-amber-50"
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${
                  billingOnboarding.complete ? "bg-green-500" : "bg-amber-400"
                }`}
              >
                {billingOnboarding.complete ? "\u2713" : "!"}
              </span>
              <div>
                <p
                  className={`text-sm font-medium ${
                    billingOnboarding.complete ? "text-green-800" : "text-amber-800"
                  }`}
                >
                  Billing Form
                </p>
                <p className="text-xs text-gray-500">
                  {billingOnboarding.complete
                    ? cadenceLabel(billingOnboarding.invoiceCadence)
                    : "Waiting on form"}
                </p>
                {overrides?.billing && (
                  <p className="text-xs text-fuchsia-700">
                    Override: {overrides.billing.reason}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!billingOnboarding.complete && (
                <>
                  {portalUrl && (
                    <button
                      onClick={() =>
                        handleCopy("billing", `${portalUrl}/${campaignId}`)
                      }
                      className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
                    >
                      {copiedId === "billing" ? "Copied!" : "Copy Portal Link"}
                    </button>
                  )}
                  <input
                    type="file"
                    accept=".doc,.docx,.pdf,.txt"
                    className="hidden"
                    ref={billingFileRef}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleBillingUpload(file);
                      e.target.value = "";
                    }}
                  />
                  <button
                    onClick={() => billingFileRef.current?.click()}
                    disabled={uploadingBilling}
                    className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                  >
                    {uploadingBilling ? "Uploading..." : "Upload Doc"}
                  </button>
                  <button
                    onClick={() => handleOverride("billing")}
                    disabled={overridingId === "billing"}
                    className="rounded-lg border border-fuchsia-300 bg-white px-4 py-2 text-sm font-medium text-fuchsia-800 hover:bg-fuchsia-100 disabled:opacity-50"
                  >
                    {overridingId === "billing"
                      ? "Overriding..."
                      : "Override Complete"}
                  </button>
                </>
              )}
              {billingOnboarding.complete && overrides?.billing && (
                <button
                  onClick={() => handleRemoveOverride("billing")}
                  disabled={overridingId === "billing"}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                >
                  {overridingId === "billing" ? "Removing..." : "Remove Override"}
                </button>
              )}
              {billingOnboarding.complete && billingOnboarding.uploadedDocUrl && (
                <a
                  href={getBlobViewUrl(billingOnboarding.uploadedDocUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-green-300 bg-white px-4 py-2 text-sm font-medium text-green-800 hover:bg-green-100"
                >
                  View Document
                </a>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
