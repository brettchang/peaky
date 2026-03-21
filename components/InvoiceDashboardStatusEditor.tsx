"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DashboardInvoiceStatus } from "@/lib/xero-types";

export function InvoiceDashboardStatusEditor({
  invoiceLinkId,
  initialStatus,
}: {
  invoiceLinkId: string;
  initialStatus: DashboardInvoiceStatus;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<DashboardInvoiceStatus>(initialStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(nextStatus: DashboardInvoiceStatus) {
    const previousStatus = status;
    setStatus(nextStatus);
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/invoicing/update-dashboard-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceLinkId, dashboardStatus: nextStatus }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error || "Failed to update dashboard status");
      }

      router.refresh();
    } catch (err) {
      setStatus(previousStatus);
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <label
        htmlFor={`dashboard-status-${invoiceLinkId}`}
        className="mb-1 block text-sm text-gray-700"
      >
        Admin dashboard status
      </label>
      <select
        id={`dashboard-status-${invoiceLinkId}`}
        value={status}
        onChange={(e) => onChange(e.target.value as DashboardInvoiceStatus)}
        disabled={saving}
        className="w-full max-w-[220px] rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900 disabled:opacity-50"
      >
        <option value="DRAFT">Draft</option>
        <option value="AWAITING_PAYMENT">Awaiting Payment</option>
        <option value="PAID">Paid</option>
      </select>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
