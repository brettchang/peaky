"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface CreateIoButtonProps {
  campaignId: string;
  existingDocumentUrl?: string;
  existingStatus?: string;
  disabledReason?: string;
}

export function CreateIoButton({
  campaignId,
  existingDocumentUrl,
  existingStatus,
  disabledReason,
}: CreateIoButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCreateIo() {
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/create-io", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId }),
      });

      const raw = await res.text();
      let data: {
        error?: string;
        documentUrl?: string;
        warning?: string;
      } = {};
      if (raw) {
        try {
          data = JSON.parse(raw) as typeof data;
        } catch {
          data = {};
        }
      }

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to create IO");
      }

      setMessage(data.warning ?? "Insertion order created.");
      router.refresh();

      if (data.documentUrl) {
        window.open(data.documentUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create IO");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={handleCreateIo}
        disabled={loading || Boolean(disabledReason)}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Creating IO..." : "Create IO"}
      </button>
      {existingDocumentUrl && (
        <Link
          href={existingDocumentUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-blue-700 underline"
        >
          Open IO
        </Link>
      )}
      {existingStatus && (
        <span className="text-xs text-gray-500">Status: {existingStatus}</span>
      )}
      {message && <span className="text-xs text-green-600">{message}</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
      {disabledReason && <span className="text-xs text-amber-700">{disabledReason}</span>}
    </div>
  );
}
