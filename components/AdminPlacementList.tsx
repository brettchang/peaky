"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Placement, OnboardingRound, PlacementStatus, AdLineItem } from "@/lib/types";
import type { PlacementInvoiceLink } from "@/lib/xero-types";
import { AddPlacementForm } from "@/components/AddPlacementForm";
import { CopyEditor } from "@/components/CopyEditor";
import { InvoiceLinkModal } from "@/components/InvoiceLinkModal";
import { InvoiceStatusBadge } from "@/components/InvoiceStatusBadge";

interface AdminPlacementListProps {
  placements: Placement[];
  campaignId: string;
  portalUrl: string;
  onboardingRounds?: OnboardingRound[];
  invoiceLinksByPlacement?: Record<string, PlacementInvoiceLink[]>;
  adLineItems?: AdLineItem[];
  xeroConnected?: boolean;
}

export function AdminPlacementList({
  placements,
  campaignId,
  portalUrl,
  onboardingRounds,
  invoiceLinksByPlacement = {},
  adLineItems = [],
  xeroConnected = false,
}: AdminPlacementListProps) {
  const router = useRouter();
  const [copiedLink, setCopiedLink] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editedCopy, setEditedCopy] = useState<Record<string, string>>({});
  const [savingCopyId, setSavingCopyId] = useState<string | null>(null);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState("");
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncMessages, setSyncMessages] = useState<
    Record<string, { type: "error" | "success"; text: string }>
  >({});
  const [invoiceModalPlacementId, setInvoiceModalPlacementId] = useState<string | null>(null);
  const [unlinkingInvoiceId, setUnlinkingInvoiceId] = useState<string | null>(null);

  async function handleCopyPortalLink() {
    await navigator.clipboard.writeText(portalUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  const getEditedCopy = useCallback(
    (placement: Placement) =>
      editedCopy[placement.id] ?? placement.currentCopy,
    [editedCopy]
  );

  function handleCopyChange(placementId: string, value: string) {
    setEditedCopy((prev) => ({ ...prev, [placementId]: value }));
  }

  async function handleSaveCopy(placementId: string) {
    const copy = editedCopy[placementId];
    if (copy === undefined) return;
    setSavingCopyId(placementId);
    try {
      const res = await fetch("/api/update-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, placementId, copy }),
      });
      if (res.ok) {
        setEditedCopy((prev) => {
          const next = { ...prev };
          delete next[placementId];
          return next;
        });
        router.refresh();
      }
    } finally {
      setSavingCopyId(null);
    }
  }

  async function handleStatusChange(placementId: string, status: string) {
    setUpdatingId(placementId);
    try {
      const res = await fetch("/api/update-placement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, placementId, status }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDateChange(placementId: string, value: string) {
    setUpdatingId(placementId);
    try {
      const res = await fetch("/api/update-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          placementId,
          scheduledDate: value || null,
        }),
      });
      if (res.ok) {
        window.location.reload();
      }
    } finally {
      setUpdatingId(null);
    }
  }

  function startEditingLink(placement: Placement) {
    setEditingLinkId(placement.id);
    setLinkDraft(placement.linkToPlacement ?? "");
  }

  async function handleSyncStats(placementId: string) {
    setSyncingId(placementId);
    setSyncMessages((prev) => {
      const next = { ...prev };
      delete next[placementId];
      return next;
    });
    try {
      const res = await fetch("/api/sync-beehiiv-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, placementId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSyncMessages((prev) => ({
          ...prev,
          [placementId]: { type: "error", text: data.error ?? "Sync failed" },
        }));
      } else {
        setSyncMessages((prev) => ({
          ...prev,
          [placementId]: { type: "success", text: "Stats synced" },
        }));
        router.refresh();
      }
    } catch {
      setSyncMessages((prev) => ({
        ...prev,
        [placementId]: { type: "error", text: "Network error" },
      }));
    } finally {
      setSyncingId(null);
    }
  }

  async function handleSaveLink(placementId: string) {
    setUpdatingId(placementId);
    try {
      const res = await fetch("/api/update-placement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          placementId,
          linkToPlacement: linkDraft || null,
        }),
      });
      if (res.ok) {
        setEditingLinkId(null);
        router.refresh();
      }
    } finally {
      setUpdatingId(null);
    }
  }

  function getPlacementCost(placement: Placement): number | null {
    const item = adLineItems.find((li) => li.type === placement.type);
    return item ? item.pricePerUnit : null;
  }

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  async function handleUnlinkInvoice(linkId: string) {
    setUnlinkingInvoiceId(linkId);
    try {
      const res = await fetch("/api/xero/unlink-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId, type: "placement" }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setUnlinkingInvoiceId(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          Placements ({placements.length})
        </h2>
        <div className="flex items-center gap-2">
          <AddPlacementForm campaignId={campaignId} onboardingRounds={onboardingRounds} />
          <button
            onClick={handleCopyPortalLink}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {copiedLink ? "Copied!" : "Copy Portal Link"}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {placements.map((placement) => {
          const isExpanded = expandedId === placement.id;
          return (
            <div
              key={placement.id}
              className="rounded-lg border border-gray-200 bg-white"
            >
              <div className="px-5 py-4">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/dashboard/${campaignId}/${placement.id}`}
                        className="font-medium text-gray-900 hover:text-blue-600 hover:underline"
                      >
                        {placement.name}
                      </Link>
                      <select
                        value={placement.status}
                        disabled={updatingId === placement.id}
                        onChange={(e) =>
                          handleStatusChange(placement.id, e.target.value)
                        }
                        className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 disabled:opacity-50"
                      >
                        {([
                          "New Campaign",
                          "Copywriting in Progress",
                          "Peak Team Review Complete",
                          "Sent for Approval",
                          "Approved",
                        ] as PlacementStatus[]).map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      {placement.status === "Sent for Approval" && (
                        <button
                          onClick={() =>
                            handleStatusChange(placement.id, "Approved")
                          }
                          disabled={updatingId === placement.id}
                          className="rounded-lg bg-green-600 px-2.5 py-0.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          Approve
                        </button>
                      )}
                    </div>
                    <div className="mt-1 flex gap-4 text-sm text-gray-500">
                      <span>{placement.type}</span>
                      <span>{placement.publication}</span>
                      <span>v{placement.copyVersion}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <label
                        htmlFor={`date-${placement.id}`}
                        className="text-sm text-gray-500"
                      >
                        Scheduled:
                      </label>
                      <input
                        id={`date-${placement.id}`}
                        type="date"
                        defaultValue={placement.scheduledDate ?? ""}
                        disabled={updatingId === placement.id}
                        onChange={(e) =>
                          handleDateChange(placement.id, e.target.value)
                        }
                        className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-700 disabled:opacity-50"
                      />
                    </div>
                    <button
                      onClick={() =>
                        setExpandedId(isExpanded ? null : placement.id)
                      }
                      className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {isExpanded ? "Hide Copy" : "Edit Copy"}
                    </button>
                  </div>
                </div>

                {/* Inline link editing + Check Results */}
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <span className="text-xs text-gray-500">Link:</span>
                  {editingLinkId === placement.id ? (
                    <>
                      <input
                        type="url"
                        value={linkDraft}
                        onChange={(e) => setLinkDraft(e.target.value)}
                        placeholder="https://..."
                        className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveLink(placement.id);
                          if (e.key === "Escape") setEditingLinkId(null);
                        }}
                      />
                      <button
                        onClick={() => handleSaveLink(placement.id)}
                        disabled={updatingId === placement.id}
                        className="rounded bg-gray-900 px-2 py-0.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingLinkId(null)}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      {placement.linkToPlacement ? (
                        <a
                          href={placement.linkToPlacement}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate text-xs text-blue-600 hover:text-blue-700"
                        >
                          {placement.linkToPlacement}
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400">Not set</span>
                      )}
                      <button
                        onClick={() => startEditingLink(placement)}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        {placement.linkToPlacement ? "Edit" : "Add"}
                      </button>
                      {(placement.linkToPlacement || placement.beehiivPostId) && (
                        <>
                          <span className="text-gray-300">|</span>
                          <button
                            onClick={() => handleSyncStats(placement.id)}
                            disabled={syncingId === placement.id}
                            className="text-xs font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                          >
                            {syncingId === placement.id
                              ? "Checking..."
                              : placement.stats
                                ? "Re-check Results"
                                : "Check Results"}
                          </button>
                        </>
                      )}
                      {syncMessages[placement.id] && (
                        <span
                          className={`text-xs ${
                            syncMessages[placement.id].type === "error"
                              ? "text-red-600"
                              : "text-green-600"
                          }`}
                        >
                          {syncMessages[placement.id].text}
                        </span>
                      )}
                    </>
                  )}
                </div>

                {/* Compact stats row */}
                {placement.stats && (
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                    {placement.stats.totalSends != null && (
                      <span className="text-xs text-gray-500">
                        Sends:{" "}
                        <span className="font-semibold text-gray-900">
                          {placement.stats.totalSends.toLocaleString()}
                        </span>
                      </span>
                    )}
                    {placement.stats.openRate != null && (
                      <span className="text-xs text-gray-500">
                        Open Rate:{" "}
                        <span className="font-semibold text-gray-900">
                          {placement.stats.openRate}%
                        </span>
                      </span>
                    )}
                    {placement.stats.totalOpens != null && (
                      <span className="text-xs text-gray-500">
                        Total Opens:{" "}
                        <span className="font-semibold text-gray-900">
                          {placement.stats.totalOpens.toLocaleString()}
                        </span>
                      </span>
                    )}
                    {placement.stats.uniqueOpens != null && (
                      <span className="text-xs text-gray-500">
                        Unique Opens:{" "}
                        <span className="font-semibold text-gray-900">
                          {placement.stats.uniqueOpens.toLocaleString()}
                        </span>
                      </span>
                    )}
                    {placement.stats.uniqueClicks != null && (
                      <span className="text-xs text-gray-500">
                        Clicks:{" "}
                        <span className="font-semibold text-gray-900">
                          {placement.stats.uniqueClicks.toLocaleString()}
                        </span>
                      </span>
                    )}
                  </div>
                )}

                {/* Cost + Invoice row */}
                {(() => {
                  const cost = getPlacementCost(placement);
                  const links = invoiceLinksByPlacement[placement.id] ?? [];
                  const invoiceTotal = links.reduce(
                    (sum, l) => sum + (l.invoice?.total ?? 0),
                    0
                  );
                  const showRow = cost != null || links.length > 0 || xeroConnected;
                  if (!showRow) return null;
                  return (
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      {cost != null && (
                        <span className="text-gray-500">
                          Cost:{" "}
                          <span className="font-semibold text-gray-900">
                            {formatCurrency(cost)}
                          </span>
                        </span>
                      )}
                      {links.length > 0 && (
                        <span className="text-gray-500">
                          {links.length} invoice{links.length !== 1 ? "s" : ""} —{" "}
                          <span className="font-semibold text-gray-900">
                            {formatCurrency(invoiceTotal)}
                          </span>
                        </span>
                      )}
                      {links.map((link) => (
                        <span
                          key={link.id}
                          className="inline-flex items-center gap-1"
                        >
                          <span className="font-medium text-gray-700">
                            {link.invoice?.invoiceNumber ||
                              link.xeroInvoiceId.slice(0, 8)}
                          </span>
                          {link.invoice && (
                            <InvoiceStatusBadge status={link.invoice.status} />
                          )}
                          <button
                            onClick={() => handleUnlinkInvoice(link.id)}
                            disabled={unlinkingInvoiceId === link.id}
                            className="text-red-400 hover:text-red-600 disabled:opacity-50"
                          >
                            {unlinkingInvoiceId === link.id ? "..." : "×"}
                          </button>
                        </span>
                      ))}
                      {xeroConnected && (
                        <button
                          onClick={() =>
                            setInvoiceModalPlacementId(placement.id)
                          }
                          className="font-medium text-blue-600 hover:text-blue-700"
                        >
                          + Link Invoice
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>

              {isExpanded && (
                <div className="border-t border-gray-200 px-5 py-4">
                  <CopyEditor
                    value={getEditedCopy(placement)}
                    onChange={(val) => handleCopyChange(placement.id, val)}
                  />

                  {editedCopy[placement.id] !== undefined &&
                    editedCopy[placement.id] !== placement.currentCopy && (
                      <div className="mt-3 flex items-center gap-3">
                        <button
                          onClick={() => handleSaveCopy(placement.id)}
                          disabled={savingCopyId === placement.id}
                          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                        >
                          {savingCopyId === placement.id
                            ? "Saving..."
                            : "Save Copy"}
                        </button>
                        <button
                          onClick={() =>
                            setEditedCopy((prev) => {
                              const next = { ...prev };
                              delete next[placement.id];
                              return next;
                            })
                          }
                          className="text-sm text-gray-500 hover:text-gray-700"
                        >
                          Discard changes
                        </button>
                      </div>
                    )}

                  {placement.revisionNotes && (
                    <div className="mt-4 rounded-lg bg-amber-50 px-4 py-3">
                      <p className="text-xs font-medium text-amber-700">
                        Revision Notes
                      </p>
                      <p className="mt-1 text-sm text-amber-800">
                        {placement.revisionNotes}
                      </p>
                    </div>
                  )}

                </div>
              )}
            </div>
          );
        })}
      </div>

      {invoiceModalPlacementId && (
        <InvoiceLinkModal
          campaignId={campaignId}
          placementId={invoiceModalPlacementId}
          existingInvoiceIds={
            (invoiceLinksByPlacement[invoiceModalPlacementId] ?? []).map(
              (l) => l.xeroInvoiceId
            )
          }
          onClose={() => setInvoiceModalPlacementId(null)}
        />
      )}
    </div>
  );
}
