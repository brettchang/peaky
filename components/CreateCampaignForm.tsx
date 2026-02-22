"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlacementType } from "@/lib/types";

const PLACEMENT_TYPES: PlacementType[] = [
  "Primary",
  "Secondary",
  "Peak Picks",
  "Beehiv",
  "Smart Links",
  "BLS",
  "Podcast Ad",
];

interface LineItem {
  quantity: string;
  type: PlacementType | "";
  pricePerUnit: string;
}

export function CreateCampaignForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { quantity: "", type: "", pricePerUnit: "" },
  ]);

  function addLineItem() {
    setLineItems([...lineItems, { quantity: "", type: "", pricePerUnit: "" }]);
  }

  function removeLineItem(index: number) {
    setLineItems(lineItems.filter((_, i) => i !== index));
  }

  function updateLineItem(index: number, field: keyof LineItem, value: string) {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  }

  function resetForm() {
    setLineItems([{ quantity: "", type: "", pricePerUnit: "" }]);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);

    // Build adLineItems from state, filtering out empty rows
    const adLineItems = lineItems
      .filter((li) => li.quantity && li.type)
      .map((li) => ({
        quantity: Number(li.quantity),
        type: li.type,
        pricePerUnit: Number(li.pricePerUnit) || 0,
      }));

    const res = await fetch("/api/create-campaign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName: formData.get("clientName"),
        name: formData.get("name"),
        campaignManager: formData.get("campaignManager") || undefined,
        contactName: formData.get("contactName") || undefined,
        contactEmail: formData.get("contactEmail") || undefined,
        adLineItems: adLineItems.length > 0 ? adLineItems : undefined,
        notes: formData.get("notes") || undefined,
      }),
    });

    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setError(data.error || "Something went wrong");
      return;
    }

    setOpen(false);
    resetForm();
    router.push(`/dashboard/${data.campaignId}`);
  }

  const totalAds = lineItems.reduce(
    (sum, li) => sum + (Number(li.quantity) || 0),
    0
  );
  const totalValue = lineItems.reduce(
    (sum, li) => sum + (Number(li.quantity) || 0) * (Number(li.pricePerUnit) || 0),
    0
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
      >
        + New Campaign
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                New Campaign
              </h2>
              <button
                onClick={() => { setOpen(false); resetForm(); }}
                className="text-gray-400 hover:text-gray-600"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Client */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Client <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="clientName"
                  required
                  placeholder="e.g. Felix Health"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
                />
              </div>

              {/* Campaign name */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Campaign Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="e.g. Felix Health 1800"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
                />
              </div>

              {/* Campaign manager */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Sales Person / Campaign Manager
                </label>
                <input
                  type="text"
                  name="campaignManager"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
                />
              </div>

              {/* Two-column row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Contact Name
                  </label>
                  <input
                    type="text"
                    name="contactName"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Contact Email
                  </label>
                  <input
                    type="email"
                    name="contactEmail"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Ad Line Items */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">
                    Ads Sold
                  </label>
                  <button
                    type="button"
                    onClick={addLineItem}
                    className="text-xs font-medium text-gray-600 hover:text-gray-900"
                  >
                    + Add line
                  </button>
                </div>

                <div className="space-y-2">
                  {/* Column headers */}
                  <div className="grid grid-cols-[60px_1fr_100px_28px] items-center gap-2">
                    <span className="text-xs text-gray-500">Qty</span>
                    <span className="text-xs text-gray-500">Ad Unit</span>
                    <span className="text-xs text-gray-500">Price Each</span>
                    <span />
                  </div>

                  {lineItems.map((li, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[60px_1fr_100px_28px] items-center gap-2"
                    >
                      <input
                        type="number"
                        min="1"
                        value={li.quantity}
                        onChange={(e) =>
                          updateLineItem(i, "quantity", e.target.value)
                        }
                        placeholder="#"
                        className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
                      />
                      <select
                        value={li.type}
                        onChange={(e) =>
                          updateLineItem(i, "type", e.target.value)
                        }
                        className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
                      >
                        <option value="">Select type...</option>
                        {PLACEMENT_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                          $
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={li.pricePerUnit}
                          onChange={(e) =>
                            updateLineItem(i, "pricePerUnit", e.target.value)
                          }
                          placeholder="0"
                          className="w-full rounded-lg border border-gray-300 py-1.5 pl-5 pr-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
                        />
                      </div>
                      {lineItems.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeLineItem(i)}
                          className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        >
                          &times;
                        </button>
                      ) : (
                        <span />
                      )}
                    </div>
                  ))}
                </div>

                {/* Totals row */}
                {totalAds > 0 && (
                  <div className="mt-2 flex gap-4 text-xs text-gray-500">
                    <span>{totalAds} ad{totalAds !== 1 ? "s" : ""} total</span>
                    {totalValue > 0 && (
                      <span>${totalValue.toLocaleString()} total value</span>
                    )}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Additional Notes
                </label>
                <textarea
                  name="notes"
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setOpen(false); resetForm(); }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {submitting ? "Creating..." : "Create Campaign"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
