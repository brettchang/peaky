"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function InvoiceUnlinkButton({
  linkId,
}: {
  linkId: string;
}) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (isDeleting) return;
    const confirmed = window.confirm(
      "Delete this invoice page? This will unlink the invoice from the campaign."
    );
    if (!confirmed) return;

    setIsDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/xero/unlink-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId, type: "campaign" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Failed to delete invoice page");
      }
      router.push("/dashboard/invoicing");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete invoice page");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={handleDelete}
        disabled={isDeleting}
        className="inline-flex items-center rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isDeleting ? "Deleting..." : "Delete Invoice Page"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
