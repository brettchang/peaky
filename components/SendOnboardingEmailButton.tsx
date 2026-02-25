"use client";

import { useState } from "react";

export function SendOnboardingEmailButton({
  campaignId,
  campaignName,
  clientName,
  recipientEmail,
  recipientName,
  portalCampaignUrl,
}: {
  campaignId: string;
  campaignName: string;
  clientName: string;
  recipientEmail?: string;
  recipientName?: string;
  portalCampaignUrl: string;
}) {
  const [sendingType, setSendingType] = useState<"onboarding" | "copywriting" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSend(type: "onboarding" | "copywriting") {
    if (!recipientEmail) return;

    setSendingType(type);
    setMessage(null);
    setError(null);
    try {
      const endpoint =
        type === "onboarding"
          ? "/api/send-onboarding-email"
          : "/api/send-copywriting-update";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          campaignName,
          clientName,
          recipientEmail,
          recipientName,
          portalCampaignUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error ||
            (type === "onboarding"
              ? "Failed to send onboarding email"
              : "Failed to send copywriting update")
        );
      }
      setMessage(
        type === "onboarding"
          ? "Onboarding email sent."
          : "Copywriting update sent."
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : type === "onboarding"
            ? "Failed to send onboarding email"
            : "Failed to send copywriting update"
      );
    } finally {
      setSendingType(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => handleSend("onboarding")}
        disabled={Boolean(sendingType) || !recipientEmail}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sendingType === "onboarding" ? "Sending..." : "Send Onboarding Email"}
      </button>
      <button
        onClick={() => handleSend("copywriting")}
        disabled={Boolean(sendingType) || !recipientEmail}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sendingType === "copywriting" ? "Sending..." : "Send Copywriting Update"}
      </button>
      {message && <span className="text-xs text-green-600">{message}</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
      {!recipientEmail && (
        <span className="text-xs text-amber-700">Add a contact email first.</span>
      )}
    </div>
  );
}
