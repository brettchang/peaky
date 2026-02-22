"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Placement, PlacementType, Publication, PlacementStatus } from "@/lib/types";
import { CopyEditor } from "@/components/CopyEditor";

const PLACEMENT_TYPES: PlacementType[] = [
  "Primary",
  "Secondary",
  "Peak Picks",
  "Beehiv",
  "Smart Links",
  "BLS",
  "Podcast Ad",
];

const PUBLICATIONS: Publication[] = ["The Peak", "Peak Money"];

const PLACEMENT_STATUSES: PlacementStatus[] = [
  "New Campaign",
  "Onboarding Requested",
  "Copywriting in Progress",
  "Peak Team Review Complete",
  "Sent for Approval",
  "Approved",
  "Debrief Needed",
  "Send Debrief",
  "Client Missed Placement",
  "Hold",
  "Done",
];

const CONFLICT_OPTIONS = [
  { value: "", label: "None" },
  { value: "Defer if conflict", label: "Defer if conflict" },
  { value: "Date is crucial", label: "Date is crucial" },
];

interface AdminPlacementDetailProps {
  campaignId: string;
  placement: Placement;
}

export function AdminPlacementDetail({
  campaignId,
  placement,
}: AdminPlacementDetailProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: placement.name,
    type: placement.type,
    publication: placement.publication,
    scheduledDate: placement.scheduledDate ?? "",
    status: placement.status,
    copyProducer: placement.copyProducer ?? "",
    linkToPlacement: placement.linkToPlacement ?? "",
    conflictPreference: placement.conflictPreference ?? "",
    imageUrl: placement.imageUrl ?? "",
    logoUrl: placement.logoUrl ?? "",
    notes: placement.notes ?? "",
  });

  // Copy editing state
  const [editedCopy, setEditedCopy] = useState<string | null>(null);
  const [savingCopy, setSavingCopy] = useState(false);
  const [copyExpanded, setCopyExpanded] = useState(false);

  const currentCopy = editedCopy ?? placement.currentCopy;

  const handleCopyChange = useCallback((val: string) => {
    setEditedCopy(val);
  }, []);

  function handleCancel() {
    setForm({
      name: placement.name,
      type: placement.type,
      publication: placement.publication,
      scheduledDate: placement.scheduledDate ?? "",
      status: placement.status,
      copyProducer: placement.copyProducer ?? "",
      linkToPlacement: placement.linkToPlacement ?? "",
      conflictPreference: placement.conflictPreference ?? "",
      imageUrl: placement.imageUrl ?? "",
      logoUrl: placement.logoUrl ?? "",
      notes: placement.notes ?? "",
    });
    setEditing(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/update-placement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          placementId: placement.id,
          name: form.name,
          type: form.type,
          publication: form.publication,
          scheduledDate: form.scheduledDate || null,
          status: form.status,
          copyProducer: form.copyProducer || null,
          linkToPlacement: form.linkToPlacement || null,
          conflictPreference: form.conflictPreference || null,
          imageUrl: form.imageUrl || null,
          logoUrl: form.logoUrl || null,
          notes: form.notes || null,
        }),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveCopy() {
    if (editedCopy === null || editedCopy === placement.currentCopy) return;
    setSavingCopy(true);
    try {
      const res = await fetch("/api/update-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          placementId: placement.id,
          copy: editedCopy,
        }),
      });
      if (res.ok) {
        setEditedCopy(null);
        router.refresh();
      }
    } finally {
      setSavingCopy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Metadata section */}
      <div className="rounded-lg border border-gray-200 bg-white px-6 py-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            Placement Details
          </h3>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs font-medium text-gray-500 hover:text-gray-700"
            >
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs text-gray-500">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500">Type</label>
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm({ ...form, type: e.target.value as PlacementType })
                  }
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                >
                  {PLACEMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500">
                  Publication
                </label>
                <select
                  value={form.publication}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      publication: e.target.value as Publication,
                    })
                  }
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                >
                  {PUBLICATIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500">
                  Scheduled Date
                </label>
                <input
                  type="date"
                  value={form.scheduledDate}
                  onChange={(e) =>
                    setForm({ ...form, scheduledDate: e.target.value })
                  }
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500">Status</label>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      status: e.target.value as PlacementStatus,
                    })
                  }
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                >
                  {PLACEMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500">
                  Copy Producer
                </label>
                <div className="mt-2 flex gap-4">
                  {(["Us", "Client"] as const).map((opt) => (
                    <label
                      key={opt}
                      className="flex items-center gap-1.5 text-sm"
                    >
                      <input
                        type="radio"
                        name="copyProducer"
                        value={opt}
                        checked={form.copyProducer === opt}
                        onChange={(e) =>
                          setForm({ ...form, copyProducer: e.target.value })
                        }
                        className="text-gray-900"
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500">Link</label>
                <input
                  type="url"
                  value={form.linkToPlacement}
                  onChange={(e) =>
                    setForm({ ...form, linkToPlacement: e.target.value })
                  }
                  placeholder="https://..."
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500">
                  Conflict Preference
                </label>
                <select
                  value={form.conflictPreference}
                  onChange={(e) =>
                    setForm({ ...form, conflictPreference: e.target.value })
                  }
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                >
                  {CONFLICT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500">Image URL</label>
                <input
                  type="text"
                  value={form.imageUrl}
                  onChange={(e) =>
                    setForm({ ...form, imageUrl: e.target.value })
                  }
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500">Logo URL</label>
                <input
                  type="text"
                  value={form.logoUrl}
                  onChange={(e) =>
                    setForm({ ...form, logoUrl: e.target.value })
                  }
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div className="col-span-2 sm:col-span-3">
                <label className="block text-xs text-gray-500">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={handleCancel}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-gray-500">Name</p>
              <p className="text-sm font-medium text-gray-900">
                {placement.name}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Type</p>
              <p className="text-sm font-medium text-gray-900">
                {placement.type}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Publication</p>
              <p className="text-sm font-medium text-gray-900">
                {placement.publication}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Scheduled Date</p>
              <p className="text-sm font-medium text-gray-900">
                {placement.scheduledDate ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Status</p>
              <p className="text-sm font-medium text-gray-900">
                {placement.status}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Copy Producer</p>
              <p className="text-sm font-medium text-gray-900">
                {placement.copyProducer ?? "—"}
              </p>
            </div>
            {placement.linkToPlacement && (
              <div>
                <p className="text-xs text-gray-500">Link</p>
                <a
                  href={placement.linkToPlacement}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  {placement.linkToPlacement}
                </a>
              </div>
            )}
            {placement.conflictPreference && (
              <div>
                <p className="text-xs text-gray-500">Conflict Preference</p>
                <p className="text-sm font-medium text-gray-900">
                  {placement.conflictPreference}
                </p>
              </div>
            )}
            {placement.imageUrl && (
              <div>
                <p className="text-xs text-gray-500">Image URL</p>
                <p className="truncate text-sm font-medium text-gray-900">
                  {placement.imageUrl}
                </p>
              </div>
            )}
            {placement.logoUrl && (
              <div>
                <p className="text-xs text-gray-500">Logo URL</p>
                <p className="truncate text-sm font-medium text-gray-900">
                  {placement.logoUrl}
                </p>
              </div>
            )}
            {placement.notes && (
              <div className="col-span-2 sm:col-span-3">
                <p className="text-xs text-gray-500">Notes</p>
                <p className="mt-0.5 text-sm text-gray-900 whitespace-pre-wrap">
                  {placement.notes}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Copy section */}
      <div className="rounded-lg border border-gray-200 bg-white px-6 py-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            Copy (v{placement.copyVersion})
          </h3>
          <button
            onClick={() => setCopyExpanded(!copyExpanded)}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            {copyExpanded ? "Hide Copy" : "Edit Copy"}
          </button>
        </div>

        {copyExpanded && (
          <>
            <CopyEditor value={currentCopy} onChange={handleCopyChange} />

            {editedCopy !== null && editedCopy !== placement.currentCopy && (
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={handleSaveCopy}
                  disabled={savingCopy}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {savingCopy ? "Saving..." : "Save Copy"}
                </button>
                <button
                  onClick={() => setEditedCopy(null)}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Discard changes
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Revision notes */}
      {placement.revisionNotes && (
        <div className="rounded-lg bg-amber-50 px-5 py-4">
          <p className="text-xs font-medium text-amber-700">Revision Notes</p>
          <p className="mt-1 text-sm text-amber-800">
            {placement.revisionNotes}
          </p>
        </div>
      )}

      {/* Beehiiv Stats */}
      <BeehiivStatsCard campaignId={campaignId} placement={placement} />
    </div>
  );
}

// ─── Beehiiv Stats Card ─────────────────────────────────────

function BeehiivStatsCard({
  campaignId,
  placement,
}: {
  campaignId: string;
  placement: Placement;
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState(false);

  const hasPostId = !!placement.beehiivPostId;
  const hasLink = !!placement.linkToPlacement;
  const canSync = hasPostId || hasLink;

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    setSyncSuccess(false);
    try {
      const res = await fetch("/api/sync-beehiiv-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          placementId: placement.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSyncError(data.error ?? "Failed to sync stats");
      } else {
        setSyncSuccess(true);
        router.refresh();
      }
    } catch {
      setSyncError("Network error — could not reach the server");
    } finally {
      setSyncing(false);
    }
  }

  const buttonLabel = syncing
    ? "Syncing..."
    : hasPostId
      ? "Re-sync Stats"
      : "Sync Stats";

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-6 py-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Beehiiv Stats</h3>
        <button
          onClick={handleSync}
          disabled={syncing || !canSync}
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {buttonLabel}
        </button>
      </div>

      {hasPostId && (
        <p className="mb-3 text-xs text-gray-500">
          Post ID:{" "}
          <span className="font-mono text-gray-700">
            {placement.beehiivPostId}
          </span>
        </p>
      )}

      {!canSync && (
        <p className="text-xs text-gray-400">
          Add a link to placement or a Beehiiv post ID to enable syncing.
        </p>
      )}

      {syncError && (
        <p className="mb-3 text-xs text-red-600">{syncError}</p>
      )}
      {syncSuccess && (
        <p className="mb-3 text-xs text-green-600">Stats synced successfully.</p>
      )}

      {placement.stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {placement.stats.totalSends != null && (
            <div>
              <p className="text-xs text-gray-500">Total Sends</p>
              <p className="text-sm font-semibold text-gray-900">
                {placement.stats.totalSends.toLocaleString()}
              </p>
            </div>
          )}
          {placement.stats.openRate != null && (
            <div>
              <p className="text-xs text-gray-500">Open Rate</p>
              <p className="text-sm font-semibold text-gray-900">
                {placement.stats.openRate}%
              </p>
            </div>
          )}
          {placement.stats.totalOpens != null && (
            <div>
              <p className="text-xs text-gray-500">Total Opens</p>
              <p className="text-sm font-semibold text-gray-900">
                {placement.stats.totalOpens.toLocaleString()}
              </p>
            </div>
          )}
          {placement.stats.uniqueOpens != null && (
            <div>
              <p className="text-xs text-gray-500">Unique Opens</p>
              <p className="text-sm font-semibold text-gray-900">
                {placement.stats.uniqueOpens.toLocaleString()}
              </p>
            </div>
          )}
          {placement.stats.totalClicks != null && (
            <div>
              <p className="text-xs text-gray-500">Total Clicks</p>
              <p className="text-sm font-semibold text-gray-900">
                {placement.stats.totalClicks.toLocaleString()}
              </p>
            </div>
          )}
          {placement.stats.uniqueClicks != null && (
            <div>
              <p className="text-xs text-gray-500">Unique Clicks</p>
              <p className="text-sm font-semibold text-gray-900">
                {placement.stats.uniqueClicks.toLocaleString()}
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
        </div>
      )}
    </div>
  );
}
