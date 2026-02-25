"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Placement, PlacementType, Publication, PlacementStatus, AdLineItem } from "@/lib/types";
import type { PlacementInvoiceLink } from "@/lib/xero-types";
import { CopyEditor } from "@/components/CopyEditor";
import { InvoiceLinkModal } from "@/components/InvoiceLinkModal";
import { InvoiceStatusBadge } from "@/components/InvoiceStatusBadge";

const PLACEMENT_TYPES: PlacementType[] = [
  "Primary",
  "Secondary",
  "Peak Picks",
];

const PUBLICATIONS: Array<{ value: Publication; label: string }> = [
  { value: "The Peak", label: "The Peak Daily Newsletter" },
  { value: "Peak Money", label: "Peak Money" },
];

const PLACEMENT_STATUSES: PlacementStatus[] = [
  "New Campaign",
  "Copywriting in Progress",
  "Peak Team Review Complete",
  "Sent for Approval",
  "Approved",
];

const CONFLICT_OPTIONS = [
  { value: "", label: "None" },
  { value: "Defer if conflict", label: "Defer if conflict" },
  { value: "Date is crucial", label: "Date is crucial" },
];

interface AdminPlacementDetailProps {
  campaignId: string;
  placement: Placement;
  onboardingAnswers?: {
    roundLabel?: string;
    roundComplete?: boolean;
    campaignMessaging?: string;
    campaignDesiredAction?: string;
    placementBrief?: string;
    placementLink?: string;
    logoUrl?: string;
    imageUrl?: string;
  };
  invoiceLinks?: PlacementInvoiceLink[];
  adLineItems?: AdLineItem[];
  xeroConnected?: boolean;
}

export function AdminPlacementDetail({
  campaignId,
  placement,
  onboardingAnswers,
  invoiceLinks = [],
  adLineItems = [],
  xeroConnected = false,
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
  const [editingPlacementLink, setEditingPlacementLink] = useState(false);
  const [placementLinkDraft, setPlacementLinkDraft] = useState(
    placement.linkToPlacement ?? ""
  );
  const [savingPlacementLink, setSavingPlacementLink] = useState(false);

  // Copy editing state
  const [savedCopy, setSavedCopy] = useState(placement.currentCopy);
  const [editedCopy, setEditedCopy] = useState<string | null>(null);
  const [savingCopy, setSavingCopy] = useState(false);
  const [copyExpanded, setCopyExpanded] = useState(false);
  const [showOnboardingAnswers, setShowOnboardingAnswers] = useState(false);

  useEffect(() => {
    setSavedCopy(placement.currentCopy);
  }, [placement.id, placement.currentCopy]);

  const currentCopy = editedCopy ?? savedCopy;

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

  function handleEditPlacementLink() {
    setPlacementLinkDraft(placement.linkToPlacement ?? "");
    setEditingPlacementLink(true);
  }

  function handleCancelPlacementLink() {
    setPlacementLinkDraft(placement.linkToPlacement ?? "");
    setEditingPlacementLink(false);
  }

  async function handleSavePlacementLink() {
    const nextLink = placementLinkDraft.trim();
    setSavingPlacementLink(true);
    try {
      const res = await fetch("/api/update-placement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          placementId: placement.id,
          linkToPlacement: nextLink || null,
        }),
      });
      if (res.ok) {
        setForm((prev) => ({ ...prev, linkToPlacement: nextLink }));
        setEditingPlacementLink(false);
        router.refresh();
      }
    } finally {
      setSavingPlacementLink(false);
    }
  }

  async function handleSaveCopy() {
    if (editedCopy === null || editedCopy === savedCopy) return;
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
        setSavedCopy(editedCopy);
        setEditedCopy(null);
        router.refresh();
      }
    } finally {
      setSavingCopy(false);
    }
  }

  async function handlePeakTeamApproved() {
    const hasDraftChanges =
      editedCopy !== null && editedCopy !== savedCopy;

    setSavingCopy(true);
    try {
      if (hasDraftChanges) {
        const nextCopy = editedCopy;
        const saveRes = await fetch("/api/update-copy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignId,
            placementId: placement.id,
            copy: editedCopy,
          }),
        });
        if (!saveRes.ok) return;
        setSavedCopy(nextCopy);
        setEditedCopy(null);
      }

      const statusRes = await fetch("/api/update-placement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          placementId: placement.id,
          status: "Peak Team Review Complete",
        }),
      });
      if (statusRes.ok) {
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
                    <option key={p.value} value={p.value}>
                      {p.label}
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
              <div className="col-span-2 sm:col-span-3">
                <p className="text-xs text-gray-500">Link</p>
                <a
                  href={placement.linkToPlacement}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 block break-all text-sm font-medium text-blue-600 hover:text-blue-700"
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
            {placement.type === "Primary" &&
              (placement.logoUrl || placement.imageUrl) && (
                <div className="col-span-2 sm:col-span-3">
                  <p className="text-xs text-gray-500">Uploaded Assets</p>
                  <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {placement.logoUrl && (
                      <AssetPreviewCard label="Logo" url={placement.logoUrl} />
                    )}
                    {placement.imageUrl && (
                      <AssetPreviewCard
                        label="Story Image"
                        url={placement.imageUrl}
                      />
                    )}
                  </div>
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

      {/* Placement link section */}
      <div className="rounded-lg border border-gray-200 bg-white px-6 py-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            Placement Link
          </h3>
          {!editingPlacementLink && !editing && (
            <button
              onClick={handleEditPlacementLink}
              className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              {placement.linkToPlacement ? "Edit Link" : "Add Link"}
            </button>
          )}
        </div>

        {editingPlacementLink ? (
          <div className="space-y-3">
            <input
              type="url"
              value={placementLinkDraft}
              onChange={(e) => setPlacementLinkDraft(e.target.value)}
              placeholder="https://..."
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-700"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleSavePlacementLink}
                disabled={savingPlacementLink}
                className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {savingPlacementLink ? "Saving..." : "Save Link"}
              </button>
              <button
                onClick={handleCancelPlacementLink}
                disabled={savingPlacementLink}
                className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : placement.linkToPlacement ? (
          <a
            href={placement.linkToPlacement}
            target="_blank"
            rel="noopener noreferrer"
            className="block break-all text-sm text-blue-600 hover:text-blue-700"
          >
            {placement.linkToPlacement}
          </a>
        ) : (
          <p className="text-sm text-gray-400">No link set yet.</p>
        )}
      </div>

      {/* Copy onboarding answers */}
      <div className="rounded-lg border border-gray-200 bg-white px-6 py-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            Copy Onboarding Answers
          </h3>
          <button
            onClick={() => setShowOnboardingAnswers((prev) => !prev)}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            {showOnboardingAnswers ? "Hide" : "Show"}
          </button>
        </div>

        {showOnboardingAnswers && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-gray-500">Onboarding Round</p>
                <p className="text-sm font-medium text-gray-900">
                  {onboardingAnswers?.roundLabel || placement.onboardingRoundId || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Round Status</p>
                <p className="text-sm font-medium text-gray-900">
                  {onboardingAnswers?.roundComplete === undefined
                    ? "—"
                    : onboardingAnswers.roundComplete
                    ? "Submitted"
                    : "Pending"}
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-500">Campaign Messaging</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-900">
                {onboardingAnswers?.campaignMessaging || "—"}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500">Desired Reader Action</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-900">
                {onboardingAnswers?.campaignDesiredAction || "—"}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500">Placement Brief</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-900">
                {onboardingAnswers?.placementBrief || "—"}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500">Placement Link</p>
              {onboardingAnswers?.placementLink ? (
                <a
                  href={onboardingAnswers.placementLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block break-all text-sm text-blue-600 hover:text-blue-700"
                >
                  {onboardingAnswers.placementLink}
                </a>
              ) : (
                <p className="mt-1 text-sm text-gray-900">—</p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-gray-500">Logo URL</p>
                <p className="mt-1 break-all text-sm text-gray-900">
                  {onboardingAnswers?.logoUrl || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Story Image URL</p>
                <p className="mt-1 break-all text-sm text-gray-900">
                  {onboardingAnswers?.imageUrl || "—"}
                </p>
              </div>
            </div>
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

            {(placement.status === "Copywriting in Progress" ||
              placement.status === "New Campaign") && (
              <div className="mt-3">
                <button
                  onClick={handlePeakTeamApproved}
                  disabled={savingCopy}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingCopy ? "Updating..." : "The Peak Team Has Approved"}
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

      {/* Invoices */}
      <PlacementInvoiceSection
        campaignId={campaignId}
        placementId={placement.id}
        placementType={placement.type}
        placementPublication={placement.publication}
        invoiceLinks={invoiceLinks}
        adLineItems={adLineItems}
        xeroConnected={xeroConnected}
      />

      {/* Beehiiv Stats */}
      <BeehiivStatsCard campaignId={campaignId} placement={placement} />
    </div>
  );
}

function AssetPreviewCard({ label, url }: { label: string; url: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="text-xs font-medium text-gray-600">{label}</p>
      <div
        className="mt-2 h-28 w-full rounded border border-gray-200 bg-white bg-contain bg-center bg-no-repeat"
        style={{ backgroundImage: `url("${url}")` }}
      />
      <div className="mt-2 flex items-center gap-3">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-blue-600 hover:text-blue-700"
        >
          View
        </a>
        <a
          href={url}
          download
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-gray-700 hover:text-gray-900"
        >
          Download
        </a>
      </div>
      <p className="mt-1 truncate text-xs text-gray-500">{url}</p>
    </div>
  );
}

// ─── Placement Invoice Section ───────────────────────────────

function PlacementInvoiceSection({
  campaignId,
  placementId,
  placementType,
  placementPublication,
  invoiceLinks,
  adLineItems,
  xeroConnected,
}: {
  campaignId: string;
  placementId: string;
  placementType: PlacementType;
  placementPublication: Publication;
  invoiceLinks: PlacementInvoiceLink[];
  adLineItems: AdLineItem[];
  xeroConnected: boolean;
}) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [unlinking, setUnlinking] = useState<string | null>(null);

  const cost =
    adLineItems.find(
      (li) =>
        li.type === placementType &&
        (li.publication ? li.publication === placementPublication : true)
    )?.pricePerUnit ?? null;
  const invoiceTotal = invoiceLinks.reduce(
    (sum, l) => sum + (l.invoice?.total ?? 0),
    0
  );

  function formatCurrency(amount: number, currency = "USD") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  }

  function formatDate(dateStr: string) {
    if (!dateStr) return "—";
    const parsed = new Date(dateStr);
    if (Number.isNaN(parsed.getTime())) return "—";
    return parsed.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  async function handleUnlink(linkId: string) {
    setUnlinking(linkId);
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
      setUnlinking(null);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-6 py-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-semibold text-gray-900">Invoices</h3>
          {cost != null && (
            <span className="text-xs text-gray-500">
              Placement cost:{" "}
              <span className="font-semibold text-gray-900">
                {formatCurrency(cost)}
              </span>
            </span>
          )}
          {invoiceLinks.length > 0 && (
            <span className="text-xs text-gray-500">
              Invoiced:{" "}
              <span className="font-semibold text-gray-900">
                {formatCurrency(invoiceTotal)}
              </span>
            </span>
          )}
        </div>
        {xeroConnected && (
          <button
            onClick={() => setShowModal(true)}
            className="rounded-md bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
          >
            + Link Invoice
          </button>
        )}
      </div>

      {invoiceLinks.length === 0 ? (
        <p className="text-sm text-gray-400">No invoices linked yet</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="pb-2 font-medium">Invoice #</th>
              <th className="pb-2 font-medium">Contact</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 text-right font-medium">Total</th>
              <th className="pb-2 text-right font-medium">Due</th>
              <th className="pb-2 text-right font-medium">Due Date</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {invoiceLinks.map((link) => (
              <tr key={link.id}>
                <td className="py-2.5 font-medium text-gray-900">
                  {link.invoice?.invoiceNumber || link.xeroInvoiceId.slice(0, 8)}
                </td>
                <td className="py-2.5 text-gray-600">
                  {link.invoice?.contact.name || "—"}
                </td>
                <td className="py-2.5">
                  {link.invoice ? (
                    <InvoiceStatusBadge status={link.invoice.status} />
                  ) : (
                    <span className="text-xs text-gray-400">Unknown</span>
                  )}
                </td>
                <td className="py-2.5 text-right text-gray-900">
                  {link.invoice
                    ? formatCurrency(link.invoice.total, link.invoice.currencyCode)
                    : "—"}
                </td>
                <td className="py-2.5 text-right text-gray-900">
                  {link.invoice
                    ? formatCurrency(link.invoice.amountDue, link.invoice.currencyCode)
                    : "—"}
                </td>
                <td className="py-2.5 text-right text-gray-600">
                  {link.invoice ? formatDate(link.invoice.dueDate) : "—"}
                </td>
                <td className="py-2.5 text-right">
                  <button
                    onClick={() => handleUnlink(link.id)}
                    disabled={unlinking === link.id}
                    className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                  >
                    {unlinking === link.id ? "..." : "Unlink"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showModal && (
        <InvoiceLinkModal
          campaignId={campaignId}
          placementId={placementId}
          existingInvoiceIds={invoiceLinks.map((l) => l.xeroInvoiceId)}
          onClose={() => setShowModal(false)}
        />
      )}
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
        </div>
      )}
    </div>
  );
}
