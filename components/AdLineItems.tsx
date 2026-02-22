"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdLineItem, PlacementType, Placement } from "@/lib/types";

const PLACEMENT_TYPES: PlacementType[] = [
  "Primary",
  "Secondary",
  "Peak Picks",
  "Beehiv",
  "Smart Links",
  "BLS",
  "Podcast Ad",
];

interface AdLineItemsProps {
  campaignId: string;
  adLineItems: AdLineItem[];
  placements: Placement[];
}

export function AdLineItems({
  campaignId,
  adLineItems: initialItems,
  placements,
}: AdLineItemsProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState(initialItems);
  const [saving, setSaving] = useState(false);

  // Count scheduled placements (those with a date) by type
  const scheduledByType: Record<string, number> = {};
  for (const p of placements) {
    if (p.scheduledDate) {
      scheduledByType[p.type] = (scheduledByType[p.type] || 0) + 1;
    }
  }

  function addRow() {
    setItems([...items, { quantity: 1, type: "Primary", pricePerUnit: 0 }]);
  }

  function removeRow(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  function updateRow(index: number, field: keyof AdLineItem, value: string) {
    const updated = [...items];
    if (field === "type") {
      updated[index] = { ...updated[index], type: value as PlacementType };
    } else {
      updated[index] = { ...updated[index], [field]: Number(value) || 0 };
    }
    setItems(updated);
  }

  function handleCancel() {
    setItems(initialItems);
    setEditing(false);
  }

  async function handleSave() {
    setSaving(true);
    const res = await fetch("/api/update-ad-line-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId, adLineItems: items }),
    });
    setSaving(false);
    if (res.ok) {
      setEditing(false);
      router.refresh();
    }
  }

  const totalSold = items.reduce((s, li) => s + li.quantity, 0);
  const totalValue = items.reduce(
    (s, li) => s + li.quantity * li.pricePerUnit,
    0
  );

  return (
    <div className="mb-8 rounded-lg border border-gray-200 bg-white px-6 py-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Ads Sold</h3>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-gray-500 hover:text-gray-700"
          >
            Edit
          </button>
        )}
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500">
            <th className="pb-2 font-medium">Qty</th>
            <th className="pb-2 font-medium">Ad Unit</th>
            <th className="pb-2 font-medium text-center">Scheduled</th>
            <th className="pb-2 font-medium text-right">Price Each</th>
            <th className="pb-2 font-medium text-right">Subtotal</th>
            {editing && <th className="pb-2 w-8" />}
          </tr>
        </thead>
        <tbody className="text-gray-900">
          {items.map((li, i) => {
            const scheduled = scheduledByType[li.type] || 0;
            const fulfilled = scheduled >= li.quantity;
            return (
              <tr key={i} className="border-t border-gray-100">
                {editing ? (
                  <>
                    <td className="py-1.5 pr-2">
                      <input
                        type="number"
                        min="1"
                        value={li.quantity}
                        onChange={(e) => updateRow(i, "quantity", e.target.value)}
                        className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <select
                        value={li.type}
                        onChange={(e) => updateRow(i, "type", e.target.value)}
                        className="rounded border border-gray-300 px-2 py-1 text-sm"
                      >
                        {PLACEMENT_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1.5 text-center">
                      <span
                        className={`text-xs font-medium ${
                          fulfilled ? "text-green-600" : "text-amber-600"
                        }`}
                      >
                        {scheduled} / {li.quantity}
                      </span>
                    </td>
                    <td className="py-1.5 pl-2">
                      <div className="flex justify-end">
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
                              updateRow(i, "pricePerUnit", e.target.value)
                            }
                            className="w-24 rounded border border-gray-300 py-1 pl-5 pr-2 text-right text-sm"
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-1.5 text-right">
                      ${(li.quantity * li.pricePerUnit).toLocaleString()}
                    </td>
                    <td className="py-1.5 pl-1">
                      {items.length > 1 && (
                        <button
                          onClick={() => removeRow(i)}
                          className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        >
                          &times;
                        </button>
                      )}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="py-1.5">{li.quantity}</td>
                    <td className="py-1.5">{li.type}</td>
                    <td className="py-1.5 text-center">
                      <span
                        className={`text-xs font-medium ${
                          fulfilled ? "text-green-600" : "text-amber-600"
                        }`}
                      >
                        {scheduled} / {li.quantity}
                      </span>
                    </td>
                    <td className="py-1.5 text-right">
                      ${li.pricePerUnit.toLocaleString()}
                    </td>
                    <td className="py-1.5 text-right">
                      ${(li.quantity * li.pricePerUnit).toLocaleString()}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 font-medium">
            <td className="pt-2">{totalSold}</td>
            <td className="pt-2" />
            <td className="pt-2 text-center text-xs text-gray-500">
              {placements.filter(p => p.scheduledDate).length} scheduled
            </td>
            <td className="pt-2" />
            <td className="pt-2 text-right">${totalValue.toLocaleString()}</td>
            {editing && <td />}
          </tr>
        </tfoot>
      </table>

      {editing && (
        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={addRow}
            className="text-xs font-medium text-gray-500 hover:text-gray-700"
          >
            + Add line
          </button>
          <div className="flex gap-2">
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
      )}
    </div>
  );
}
