"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OnboardingRound, BillingOnboarding } from "@/lib/types";

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

export function OnboardingStatus({
  rounds,
  campaignId,
  billingOnboarding,
}: {
  rounds: OnboardingRound[];
  campaignId: string;
  billingOnboarding?: BillingOnboarding;
}) {
  const router = useRouter();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showNewRound, setShowNewRound] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);

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

  return (
    <div className="mb-8 space-y-3">
      {/* Copy Onboarding section */}
      <h3 className="text-sm font-semibold text-gray-700">Copy Onboarding</h3>

      {rounds.map((round) => (
        <div
          key={round.id}
          className={`flex items-center justify-between rounded-lg border px-5 py-3 ${
            round.complete
              ? "border-green-200 bg-green-50"
              : "border-amber-200 bg-amber-50"
          }`}
        >
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
                {round.complete ? "Completed" : "Waiting on form"}
              </p>
            </div>
          </div>
          {!round.complete && (
            <button
              onClick={() => handleCopy(round.id, round.filloutLink)}
              className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
            >
              {copiedId === round.id ? "Copied!" : "Copy Fillout Link"}
            </button>
          )}
        </div>
      ))}

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
              </div>
            </div>
            {!billingOnboarding.complete && (
              <button
                onClick={() => handleCopy("billing", billingOnboarding.filloutLink)}
                className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
              >
                {copiedId === "billing" ? "Copied!" : "Copy Fillout Link"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
