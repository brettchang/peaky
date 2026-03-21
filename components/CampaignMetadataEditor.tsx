"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CAMPAIGN_MANAGERS } from "@/lib/types";
import type {
  CampaignStatus,
  CampaignContact,
  CampaignCurrency,
  CampaignCategory,
  CampaignManager,
} from "@/lib/types";

const CAMPAIGN_STATUSES: CampaignStatus[] = [
  "Onboarding to be sent",
  "Waiting for onboarding",
  "Active",
  "Placements Completed",
  "Wrapped",
];

interface CampaignMetadataEditorProps {
  campaignId: string;
  campaign: {
    name: string;
    clientName?: string;
    category: CampaignCategory;
    status: CampaignStatus;
    longTermClient?: boolean;
    complementaryCampaign?: boolean;
    salesPerson?: string;
    campaignManager?: CampaignManager;
    currency: CampaignCurrency;
    taxEligible: boolean;
    legacyOnboardingDocUrl?: string;
    contactName?: string;
    contactEmail?: string;
    contacts?: CampaignContact[];
    notes?: string;
    placementCount: number;
    specialInvoicingInstructions?: string;
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
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState({
    name: campaign.name,
    clientName: campaign.clientName ?? "",
    category: campaign.category,
    status: campaign.status,
    longTermClient: campaign.longTermClient ?? false,
    complementaryCampaign: campaign.complementaryCampaign ?? false,
    salesPerson: campaign.salesPerson ?? "",
    campaignManager: campaign.campaignManager ?? "Brett",
    currency: campaign.currency,
    taxEligible: campaign.taxEligible,
    legacyOnboardingDocUrl: campaign.legacyOnboardingDocUrl ?? "",
    contacts:
      campaign.contacts && campaign.contacts.length > 0
        ? campaign.contacts
        : campaign.contactName && campaign.contactEmail
        ? [{ name: campaign.contactName, email: campaign.contactEmail }]
        : [{ name: "", email: "" }],
    notes: campaign.notes ?? "",
    specialInvoicingInstructions: campaign.specialInvoicingInstructions ?? "",
  });

  function handleCancel() {
    setForm({
      name: campaign.name,
      clientName: campaign.clientName ?? "",
      category: campaign.category,
      status: campaign.status,
      longTermClient: campaign.longTermClient ?? false,
      complementaryCampaign: campaign.complementaryCampaign ?? false,
      salesPerson: campaign.salesPerson ?? "",
      campaignManager: campaign.campaignManager ?? "Brett",
      currency: campaign.currency,
      taxEligible: campaign.taxEligible,
      legacyOnboardingDocUrl: campaign.legacyOnboardingDocUrl ?? "",
      contacts:
        campaign.contacts && campaign.contacts.length > 0
          ? campaign.contacts
          : campaign.contactName && campaign.contactEmail
          ? [{ name: campaign.contactName, email: campaign.contactEmail }]
          : [{ name: "", email: "" }],
      notes: campaign.notes ?? "",
      specialInvoicingInstructions: campaign.specialInvoicingInstructions ?? "",
    });
    setError(null);
    setEditing(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/update-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          name: form.name,
          clientName: form.clientName,
          category: form.category,
          status: form.status,
          longTermClient: form.longTermClient,
          complementaryCampaign: form.complementaryCampaign,
          salesPerson: form.salesPerson || null,
          campaignManager: form.campaignManager,
          currency: form.currency,
          taxEligible: form.taxEligible,
          legacyOnboardingDocUrl: form.legacyOnboardingDocUrl || null,
          contacts: form.contacts
            .map((c) => ({ name: c.name.trim(), email: c.email.trim() }))
            .filter((c) => c.name && c.email),
          notes: form.notes || null,
          specialInvoicingInstructions: form.specialInvoicingInstructions || null,
        }),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Failed to update campaign");
      }
    } finally {
      setSaving(false);
    }
  }

  function updateContact(index: number, field: "name" | "email", value: string) {
    setForm((prev) => {
      const nextContacts = [...prev.contacts];
      nextContacts[index] = { ...nextContacts[index], [field]: value };
      return { ...prev, contacts: nextContacts };
    });
  }

  function addContact() {
    setForm((prev) => ({
      ...prev,
      contacts: [...prev.contacts, { name: "", email: "" }],
    }));
  }

  function removeContact(index: number) {
    setForm((prev) => ({
      ...prev,
      contacts:
        prev.contacts.length === 1
          ? [{ name: "", email: "" }]
          : prev.contacts.filter((_, i) => i !== index),
    }));
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
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-xs text-gray-500">Client Name</label>
            <input
              type="text"
              value={form.clientName}
              onChange={(e) => setForm({ ...form, clientName: e.target.value })}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Category</label>
            <select
              value={form.category}
              onChange={(e) =>
                setForm({
                  ...form,
                  category: e.target.value as CampaignCategory,
                  status:
                    e.target.value === "Evergreen" ? "Active" : form.status,
                })
              }
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="Standard">Standard</option>
              <option value="Evergreen">Evergreen</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500">Status</label>
            <select
              value={form.status}
              disabled={form.category === "Evergreen"}
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
            <label className="block text-xs text-gray-500">Sales Person</label>
            <input
              type="text"
              value={form.salesPerson}
              onChange={(e) =>
                setForm({ ...form, salesPerson: e.target.value })
              }
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-end">
            <label className="mb-1 inline-flex items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={form.longTermClient}
                onChange={(e) =>
                  setForm({
                    ...form,
                    longTermClient: e.target.checked,
                  })
                }
                className="h-4 w-4 rounded border-gray-300 text-gray-900"
              />
              Long-term client
            </label>
          </div>
          <div className="flex items-end">
            <label className="mb-1 inline-flex items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={form.complementaryCampaign}
                onChange={(e) =>
                  setForm({
                    ...form,
                    complementaryCampaign: e.target.checked,
                  })
                }
                className="h-4 w-4 rounded border-gray-300 text-gray-900"
              />
              Complementary campaign (exclude from invoicing)
            </label>
          </div>
          <div>
            <label className="block text-xs text-gray-500">
              Campaign Manager
            </label>
            <select
              value={form.campaignManager}
              onChange={(e) =>
                setForm({
                  ...form,
                  campaignManager: e.target.value as CampaignManager,
                })
              }
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              {CAMPAIGN_MANAGERS.map((manager) => (
                <option key={manager} value={manager}>
                  {manager}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500">Currency</label>
            <select
              value={form.currency}
              onChange={(e) =>
                setForm({
                  ...form,
                  currency: e.target.value as CampaignCurrency,
                })
              }
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="CAD">CAD</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="mb-1 inline-flex items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={!form.taxEligible}
                onChange={(e) =>
                  setForm({
                    ...form,
                    taxEligible: !e.target.checked,
                  })
                }
                className="h-4 w-4 rounded border-gray-300 text-gray-900"
              />
              Tax Exempt (No HST)
            </label>
          </div>
          <div className="col-span-2 sm:col-span-3">
            <label className="block text-xs text-gray-500">
              Legacy Onboarding Google Doc URL
            </label>
            <input
              type="url"
              value={form.legacyOnboardingDocUrl}
              onChange={(e) =>
                setForm({ ...form, legacyOnboardingDocUrl: e.target.value })
              }
              placeholder="https://docs.google.com/..."
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="col-span-2 sm:col-span-3">
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-xs text-gray-500">Contacts</label>
              <button
                type="button"
                onClick={addContact}
                className="text-xs font-medium text-gray-600 hover:text-gray-900"
              >
                + Add Contact
              </button>
            </div>
            <div className="space-y-2">
              {form.contacts.map((contact, index) => (
                <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <input
                    type="text"
                    value={contact.name}
                    onChange={(e) => updateContact(index, "name", e.target.value)}
                    placeholder="Contact name"
                    className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    type="email"
                    value={contact.email}
                    onChange={(e) => updateContact(index, "email", e.target.value)}
                    placeholder="contact@company.com"
                    className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeContact(index)}
                    className="rounded border border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
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
          <div className="col-span-2 sm:col-span-3">
            <label className="block text-xs text-gray-500">
              Invoicing Instructions
            </label>
            <textarea
              value={form.specialInvoicingInstructions}
              onChange={(e) =>
                setForm({
                  ...form,
                  specialInvoicingInstructions: e.target.value,
                })
              }
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
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
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
        {campaign.clientName && (
          <div>
            <p className="text-xs text-gray-500">Client</p>
            <p className="text-sm font-medium text-gray-900">
              {campaign.clientName}
            </p>
          </div>
        )}
        {campaign.salesPerson && (
          <div>
            <p className="text-xs text-gray-500">Sales Person</p>
            <p className="text-sm font-medium text-gray-900">
              {campaign.salesPerson}
            </p>
          </div>
        )}
        {campaign.campaignManager && (
          <div>
            <p className="text-xs text-gray-500">Campaign Manager</p>
            <p className="text-sm font-medium text-gray-900">
              {campaign.campaignManager}
            </p>
          </div>
        )}
        <div>
          <p className="text-xs text-gray-500">Currency</p>
          <p className="text-sm font-medium text-gray-900">
            {campaign.currency}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Tax</p>
          <p className="text-sm font-medium text-gray-900">
            {campaign.taxEligible ? "Taxable (13% HST)" : "Tax Exempt"}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Long-term Client</p>
          <p className="text-sm font-medium text-gray-900">
            {campaign.longTermClient ? "Yes" : "No"}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Complementary Campaign</p>
          <p className="text-sm font-medium text-gray-900">
            {campaign.complementaryCampaign ? "Yes" : "No"}
          </p>
        </div>
        {campaign.legacyOnboardingDocUrl && (
          <div className="col-span-2 sm:col-span-3">
            <p className="text-xs text-gray-500">Legacy Onboarding Google Doc</p>
            <a
              href={campaign.legacyOnboardingDocUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-blue-600 hover:text-blue-700 underline break-all"
            >
              {campaign.legacyOnboardingDocUrl}
            </a>
          </div>
        )}
        {campaign.contacts && campaign.contacts.length > 0 && (
          <div className="col-span-2 sm:col-span-3">
            <p className="text-xs text-gray-500">Contacts</p>
            <div className="mt-1 space-y-1">
              {campaign.contacts.map((contact, index) => (
                <p key={`${contact.email}-${index}`} className="text-sm font-medium text-gray-900">
                  {contact.name} · {contact.email}
                </p>
              ))}
            </div>
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
        {campaign.specialInvoicingInstructions && (
          <div className="col-span-2 sm:col-span-3">
            <p className="text-xs text-gray-500">Invoicing Instructions</p>
            <p className="mt-0.5 text-sm text-gray-900 whitespace-pre-wrap">
              {campaign.specialInvoicingInstructions}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
