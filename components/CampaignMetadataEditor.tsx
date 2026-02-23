"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CampaignStatus } from "@/lib/types";

const CAMPAIGN_STATUSES: CampaignStatus[] = [
  "Waiting on Onboarding",
  "Onboarding Form Complete",
  "Active",
  "Placements Completed",
  "Wrapped",
];

interface CampaignMetadataEditorProps {
  campaignId: string;
  campaign: {
    name: string;
    status: CampaignStatus;
    campaignManager?: string;
    contactName?: string;
    contactEmail?: string;
    notes?: string;
    placementCount: number;
    invoiceCadenceLabel?: string;
  };
}

export function CampaignMetadataEditor({
  campaignId,
  campaign,
}: CampaignMetadataEditorProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState({
    name: campaign.name,
    status: campaign.status,
    campaignManager: campaign.campaignManager ?? "",
    contactName: campaign.contactName ?? "",
    contactEmail: campaign.contactEmail ?? "",
    notes: campaign.notes ?? "",
  });

  function handleCancel() {
    setForm({
      name: campaign.name,
      status: campaign.status,
      campaignManager: campaign.campaignManager ?? "",
      contactName: campaign.contactName ?? "",
      contactEmail: campaign.contactEmail ?? "",
      notes: campaign.notes ?? "",
    });
    setEditing(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/update-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          name: form.name,
          status: form.status,
          campaignManager: form.campaignManager || null,
          contactName: form.contactName || null,
          contactEmail: form.contactEmail || null,
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

  if (editing) {
    return (
      <div className="mb-8 rounded-lg border border-gray-200 bg-white px-6 py-5">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">
          Campaign Details
        </h3>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-xs text-gray-500">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Status</label>
            <select
              value={form.status}
              onChange={(e) =>
                setForm({ ...form, status: e.target.value as CampaignStatus })
              }
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              {CAMPAIGN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500">
              Campaign Manager
            </label>
            <input
              type="text"
              value={form.campaignManager}
              onChange={(e) =>
                setForm({ ...form, campaignManager: e.target.value })
              }
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Contact</label>
            <input
              type="text"
              value={form.contactName}
              onChange={(e) =>
                setForm({ ...form, contactName: e.target.value })
              }
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Email</label>
            <input
              type="text"
              value={form.contactEmail}
              onChange={(e) =>
                setForm({ ...form, contactEmail: e.target.value })
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
      </div>
    );
  }

  return (
    <div className="mb-8 rounded-lg border border-gray-200 bg-white px-6 py-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">
          Campaign Details
        </h3>
        <div className="flex items-center gap-3">
          {confirmDelete ? (
            <span className="flex items-center gap-2">
              <span className="text-xs text-red-600">Delete this campaign?</span>
              <button
                onClick={async () => {
                  setDeleting(true);
                  try {
                    const res = await fetch("/api/delete-campaign", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ campaignId }),
                    });
                    if (res.ok) {
                      router.push("/dashboard");
                    }
                  } finally {
                    setDeleting(false);
                  }
                }}
                disabled={deleting}
                className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Yes, delete"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs font-medium text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-xs font-medium text-red-400 hover:text-red-600"
            >
              Delete
            </button>
          )}
          <button
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-gray-500 hover:text-gray-700"
          >
            Edit
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
        {campaign.campaignManager && (
          <div>
            <p className="text-xs text-gray-500">Campaign Manager</p>
            <p className="text-sm font-medium text-gray-900">
              {campaign.campaignManager}
            </p>
          </div>
        )}
        {campaign.contactName && (
          <div>
            <p className="text-xs text-gray-500">Contact</p>
            <p className="text-sm font-medium text-gray-900">
              {campaign.contactName}
            </p>
          </div>
        )}
        {campaign.contactEmail && (
          <div>
            <p className="text-xs text-gray-500">Email</p>
            <p className="text-sm font-medium text-gray-900">
              {campaign.contactEmail}
            </p>
          </div>
        )}
        <div>
          <p className="text-xs text-gray-500">Placements</p>
          <p className="text-sm font-medium text-gray-900">
            {campaign.placementCount}
          </p>
        </div>
        {campaign.invoiceCadenceLabel && (
          <div>
            <p className="text-xs text-gray-500">Invoice Cadence</p>
            <p className="text-sm font-medium text-gray-900">
              {campaign.invoiceCadenceLabel}
            </p>
          </div>
        )}
        {campaign.notes && (
          <div className="col-span-2 sm:col-span-3">
            <p className="text-xs text-gray-500">Notes</p>
            <p className="mt-0.5 text-sm text-gray-900 whitespace-pre-wrap">
              {campaign.notes}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
