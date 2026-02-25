"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { OnboardingRound, BillingOnboarding, Placement } from "@/lib/types";
import { CampaignOnboardingOverrides } from "@/lib/onboarding-overrides";

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
    ? ` — ${new Date(p.scheduledDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : "";
  return `${p.type}${date}`;
}

export function OnboardingStatus({
  rounds,
  campaignId,
  campaignName,
  clientName,
  recipientEmail,
  recipientName,
  billingOnboarding,
  placements = [],
  onboardingSubmittedAt,
  portalUrl,
  overrides,
}: {
  rounds: OnboardingRound[];
  campaignId: string;
  campaignName: string;
  clientName: string;
  recipientEmail?: string;
  recipientName?: string;
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
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [uploadingBilling, setUploadingBilling] = useState(false);
  const [overridingId, setOverridingId] = useState<string | null>(null);
  const [sendingCopyUpdateId, setSendingCopyUpdateId] = useState<string | null>(null);
  const [copyUpdateMessageByRound, setCopyUpdateMessageByRound] = useState<
    Record<string, { type: "success" | "error"; text: string }>
  >({});
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
        }),
      });
      if (res.ok) {
        setNewLabel("");
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

  async function handleSendCopywritingUpdate(roundId: string) {
    if (!recipientEmail || !portalUrl) return;

    setSendingCopyUpdateId(roundId);
    setCopyUpdateMessageByRound((prev) => {
      const next = { ...prev };
      delete next[roundId];
      return next;
    });
    try {
      const res = await fetch("/api/send-copywriting-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          campaignName,
          clientName,
          recipientEmail,
          recipientName,
          portalCampaignUrl: `${portalUrl}/${campaignId}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to send copywriting update");
      }
      setCopyUpdateMessageByRound((prev) => ({
        ...prev,
        [roundId]: { type: "success", text: "Copywriting update sent." },
      }));
    } catch (error: unknown) {
      setCopyUpdateMessageByRound((prev) => ({
        ...prev,
        [roundId]: {
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "Failed to send copywriting update",
        },
      }));
    } finally {
      setSendingCopyUpdateId(null);
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
                  <p
                    className={`text-sm font-medium ${
                      round.complete ? "text-green-800" : "text-amber-800"
                    }`}
                  >
                    {round.label || round.id}
                  </p>
                  <p className="text-xs text-gray-500">
                    {round.complete ? "Submitted" : "Waiting on client"}
                  </p>
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
                    <button
                      onClick={() => handleSendCopywritingUpdate(round.id)}
                      disabled={sendingCopyUpdateId === round.id || !recipientEmail}
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {sendingCopyUpdateId === round.id
                        ? "Sending..."
                        : "Send Copywriting Update"}
                    </button>
                    {copyUpdateMessageByRound[round.id] && (
                      <p
                        className={`text-xs ${
                          copyUpdateMessageByRound[round.id].type === "error"
                            ? "text-red-600"
                            : "text-green-700"
                        }`}
                      >
                        {copyUpdateMessageByRound[round.id].text}
                      </p>
                    )}
                    {!recipientEmail && (
                      <p className="text-xs text-amber-700">
                        Add a contact email first.
                      </p>
                    )}
                  </div>
                )}
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
            {unassigned.length > 0 && (
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
                  <option value="">Assign a placement...</option>
                  {unassigned.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
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
              {billingOnboarding.complete && billingOnboarding.uploadedDocUrl && (
                <a
                  href={billingOnboarding.uploadedDocUrl}
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
