"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Placement, OnboardingRound } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { AddPlacementForm } from "@/components/AddPlacementForm";
import { CopyEditor } from "@/components/CopyEditor";

interface AdminPlacementListProps {
  placements: Placement[];
  campaignId: string;
  portalUrl: string;
  onboardingRounds?: OnboardingRound[];
}

export function AdminPlacementList({
  placements,
  campaignId,
  portalUrl,
  onboardingRounds,
}: AdminPlacementListProps) {
  const router = useRouter();
  const [copiedLink, setCopiedLink] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editedCopy, setEditedCopy] = useState<Record<string, string>>({});
  const [savingCopyId, setSavingCopyId] = useState<string | null>(null);

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
              <div className="flex items-center justify-between px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/dashboard/${campaignId}/${placement.id}`}
                      className="font-medium text-gray-900 hover:text-blue-600 hover:underline"
                    >
                      {placement.name}
                    </Link>
                    <StatusBadge status={placement.status} />
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

                  {placement.stats && (
                    <div className="mt-4 grid grid-cols-4 gap-4 rounded-lg bg-gray-50 px-4 py-3">
                      {placement.stats.openRate != null && (
                        <div>
                          <p className="text-xs text-gray-500">Open Rate</p>
                          <p className="text-sm font-semibold text-gray-900">
                            {placement.stats.openRate}%
                          </p>
                        </div>
                      )}
                      {placement.stats.ctr != null && (
                        <div>
                          <p className="text-xs text-gray-500">CTR</p>
                          <p className="text-sm font-semibold text-gray-900">
                            {placement.stats.ctr}%
                          </p>
                        </div>
                      )}
                      {placement.stats.uniqueClicks != null && (
                        <div>
                          <p className="text-xs text-gray-500">
                            Unique Clicks
                          </p>
                          <p className="text-sm font-semibold text-gray-900">
                            {placement.stats.uniqueClicks.toLocaleString()}
                          </p>
                        </div>
                      )}
                      {placement.stats.totalSends != null && (
                        <div>
                          <p className="text-xs text-gray-500">Total Sends</p>
                          <p className="text-sm font-semibold text-gray-900">
                            {placement.stats.totalSends.toLocaleString()}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
