"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function GenerateCopyButton({
  campaignId,
  roundId,
  placementId,
  buttonLabel,
}: {
  campaignId: string;
  roundId?: string;
  placementId?: string;
  buttonLabel?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await fetch("/api/generate-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, roundId, placementId }),
      });
      const data = await parseJsonSafely(res);
      if (!res.ok) {
        throw new Error(
          (typeof data.error === "string" && data.error) ||
            `Failed to generate copy (HTTP ${res.status})`
        );
      }
      const generated = typeof data.generated === "number" ? data.generated : 0;
      const skipped = typeof data.skipped === "number" ? data.skipped : 0;
      const message =
        typeof data.message === "string" && data.message.trim()
          ? data.message
          : skipped > 0
            ? `Generated ${generated} placement${generated === 1 ? "" : "s"}. Skipped ${skipped} interview placement${skipped === 1 ? "" : "s"}.`
            : `Generated ${generated} placement${generated === 1 ? "" : "s"}.`;
      setSuccessMessage(message);
      setTimeout(() => setSuccessMessage(null), 5000);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to generate copy");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleGenerate}
        disabled={loading}
        className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {loading ? "Generating..." : buttonLabel || "Generate Copy with AI"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {successMessage && <p className="text-sm text-green-600">{successMessage}</p>}
    </div>
  );
}

async function parseJsonSafely(
  response: Response
): Promise<Record<string, unknown>> {
  const raw = await response.text();
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}
