"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdLineItem,
  PlacementType,
  Placement,
  Publication,
  PUBLICATIONS,
  PODCAST_PLACEMENT_TYPES,
  PODCAST_PUBLICATION,
} from "@/lib/types";

const AD_UNIT_OPTIONS: Array<{ value: PlacementType; label: string }> = [
  { value: "Primary", label: "Primary (150 words + image + logo)" },
  { value: "Secondary", label: "Secondary (75 words)" },
  { value: "Peak Picks", label: "Peak Picks (10-15 words)" },
  { value: ":30 Pre-Roll", label: "Podcast :30 Pre-Roll" },
  { value: ":30 Mid-Roll", label: "Podcast :30 Mid-Roll" },
  { value: "15 Minute Interview", label: "Podcast 15 Minute Interview" },
];

interface AdLineItemsProps {
  campaignId: string;
  adLineItems: AdLineItem[];
  placements: Placement[];
}

function getAllowedPublicationsForType(type: PlacementType): Publication[] {
  return PODCAST_PLACEMENT_TYPES.includes(type)
    ? [PODCAST_PUBLICATION]
    : PUBLICATIONS.filter((p) => p.value !== PODCAST_PUBLICATION).map((p) => p.value);
}

function getAllowedTypesForPublication(publication: Publication): PlacementType[] {
  return publication === PODCAST_PUBLICATION
    ? AD_UNIT_OPTIONS.map((t) => t.value).filter((t) => PODCAST_PLACEMENT_TYPES.includes(t))
    : AD_UNIT_OPTIONS.map((t) => t.value).filter((t) => !PODCAST_PLACEMENT_TYPES.includes(t));
}

export function AdLineItems({
  campaignId,
  adLineItems: initialItems,
  placements,
}: AdLineItemsProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState(() =>
    initialItems.map((item) => ({
      ...item,
      publication: item.publication ?? "The Peak",
    }))
  );
  const [saving, setSaving] = useState(false);

  const isPodcastLineItem = (lineItem: AdLineItem) =>
    PODCAST_PLACEMENT_TYPES.includes(lineItem.type) ||
    lineItem.publication === PODCAST_PUBLICATION;

  // Count scheduled placements (those with a date) by type + publication
  const scheduledByType: Record<string, number> = {};
  for (const p of placements) {
    if (p.scheduledDate) {
      const key = `${p.type}|${p.publication}`;
      scheduledByType[key] = (scheduledByType[key] || 0) + 1;
    }
  }

  function addRow(kind: "newsletter" | "podcast") {
    const nextItem =
      kind === "podcast"
        ? {
            quantity: 1,
            type: ":30 Pre-Roll" as PlacementType,
            publication: PODCAST_PUBLICATION,
            pricePerUnit: 0,
          }
        : {
            quantity: 1,
            type: "Primary" as PlacementType,
            publication: "The Peak" as Publication,
            pricePerUnit: 0,
          };
    setItems([...items, nextItem]);
  }

  function removeRow(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  function updateRow(index: number, field: keyof AdLineItem, value: string) {
    const updated = [...items];
    if (field === "type") {
      const nextType = value as PlacementType;
      const allowedPublications = getAllowedPublicationsForType(nextType);
      const nextPublication = allowedPublications.includes(updated[index].publication)
        ? updated[index].publication
        : allowedPublications[0];
      updated[index] = { ...updated[index], type: nextType, publication: nextPublication };
    } else if (field === "publication") {
      const nextPublication = value as Publication;
      const allowedTypes = getAllowedTypesForPublication(nextPublication);
      const nextType = allowedTypes.includes(updated[index].type)
        ? updated[index].type
        : allowedTypes[0];
      updated[index] = { ...updated[index], publication: nextPublication, type: nextType };
    } else if (field === "quantity" || field === "pricePerUnit") {
      updated[index] = { ...updated[index], [field]: Number(value) || 0 };
    }
    setItems(updated);
  }

  function handleCancel() {
    setItems(
      initialItems.map((item) => ({
        ...item,
        publication: item.publication ?? "The Peak",
      }))
    );
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

  const newsletterEntries = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !isPodcastLineItem(item));
  const podcastEntries = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isPodcastLineItem(item));

  function sectionTotals(entries: Array<{ item: AdLineItem; index: number }>) {
    return {
      sold: entries.reduce((sum, entry) => sum + entry.item.quantity, 0),
      value: entries.reduce(
        (sum, entry) => sum + entry.item.quantity * entry.item.pricePerUnit,
        0
      ),
    };
  }

  const newsletterTotals = sectionTotals(newsletterEntries);
  const podcastTotals = sectionTotals(podcastEntries);
  const newsletterScheduledCount = placements.filter(
    (placement) =>
      placement.scheduledDate &&
      !isPodcastLineItem({
        quantity: 0,
        type: placement.type,
        publication: placement.publication,
        pricePerUnit: 0,
      })
  ).length;
  const podcastScheduledCount = placements.filter(
    (placement) =>
      placement.scheduledDate &&
      isPodcastLineItem({
        quantity: 0,
        type: placement.type,
        publication: placement.publication,
        pricePerUnit: 0,
      })
  ).length;

  return (
    <div className="mb-8 space-y-4">
      {[
        {
          key: "newsletter",
          title: "Ads Sold",
          entries: newsletterEntries,
          totals: newsletterTotals,
          scheduledCount: newsletterScheduledCount,
          addKind: "newsletter" as const,
        },
        {
          key: "podcast",
          title: "Podcast Integrations Sold",
          entries: podcastEntries,
          totals: podcastTotals,
          scheduledCount: podcastScheduledCount,
          addKind: "podcast" as const,
        },
      ].map((section) => (
        <div
          key={section.key}
          className="rounded-lg border border-gray-200 bg-white px-6 py-5"
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">{section.title}</h3>
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
                <th className="pb-2 font-medium">Publication</th>
                <th className="pb-2 font-medium text-center">Scheduled</th>
                <th className="pb-2 font-medium text-right">Price Each</th>
                <th className="pb-2 font-medium text-right">Subtotal</th>
                {editing && <th className="pb-2 w-8" />}
              </tr>
            </thead>
            <tbody className="text-gray-900">
              {section.entries.length === 0 ? (
                <tr className="border-t border-gray-100">
                  <td
                    colSpan={editing ? 7 : 6}
                    className="py-3 text-sm text-gray-400"
                  >
                    No line items yet.
                  </td>
                </tr>
              ) : (
                section.entries.map(({ item: li, index: i }) => {
                  const key = `${li.type}|${li.publication ?? "The Peak"}`;
                  const scheduled = scheduledByType[key] || 0;
                  const fulfilled = scheduled >= li.quantity;
                  const allowedTypes = getAllowedTypesForPublication(li.publication);
                  const allowedPublications = getAllowedPublicationsForType(li.type);
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
                              {AD_UNIT_OPTIONS.filter((t) =>
                                allowedTypes.includes(t.value)
                              ).map((t) => (
                                <option key={t.value} value={t.value}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-1.5 pr-2">
                            <select
                              value={li.publication ?? "The Peak"}
                              onChange={(e) => updateRow(i, "publication", e.target.value)}
                              className="rounded border border-gray-300 px-2 py-1 text-sm"
                            >
                              {PUBLICATIONS.filter((p) =>
                                allowedPublications.includes(p.value)
                              ).map((p) => (
                                <option key={p.value} value={p.value}>
                                  {p.label}
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
                          <td className="py-1.5">{li.publication ?? "The Peak"}</td>
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
                })
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 font-medium">
                <td className="pt-2">{section.totals.sold}</td>
                <td className="pt-2" />
                <td className="pt-2" />
                <td className="pt-2 text-center text-xs text-gray-500">
                  {section.scheduledCount} scheduled
                </td>
                <td className="pt-2" />
                <td className="pt-2 text-right">
                  ${section.totals.value.toLocaleString()}
                </td>
                {editing && <td />}
              </tr>
            </tfoot>
          </table>

          {editing && (
            <div className="mt-3">
              <button
                onClick={() => addRow(section.addKind)}
                className="text-xs font-medium text-gray-500 hover:text-gray-700"
              >
                + Add line
              </button>
            </div>
          )}
        </div>
      ))}

      {editing && (
        <div className="flex items-center justify-end gap-2">
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
      )}
    </div>
  );
}
