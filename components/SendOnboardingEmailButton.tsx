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
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    if (!recipientEmail) return;

    setSending(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/send-onboarding-email", {
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
        throw new Error(data.error || "Failed to send onboarding email");
      }
      setMessage("Onboarding email sent.");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to send onboarding email"
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleSend}
        disabled={sending || !recipientEmail}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sending ? "Sending..." : "Send Onboarding Email"}
      </button>
      {message && <span className="text-xs text-green-600">{message}</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
      {!recipientEmail && (
        <span className="text-xs text-amber-700">Add a contact email first.</span>
      )}
    </div>
  );
}

