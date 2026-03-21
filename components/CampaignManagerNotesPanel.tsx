"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CampaignManager, CampaignManagerNote } from "@/lib/types";
import { CAMPAIGN_MANAGERS } from "@/lib/types";

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Toronto",
    timeZoneName: "short",
  }).format(parsed);
}

export function CampaignManagerNotesPanel({
  campaignId,
  defaultAuthor,
  notes,
}: {
  campaignId: string;
  defaultAuthor: CampaignManager;
  notes: CampaignManagerNote[];
}) {
  const router = useRouter();
  const [authorName, setAuthorName] = useState<CampaignManager>(defaultAuthor);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/campaign-manager-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, note, authorName }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error || "Failed to save note");
      }

      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mb-8 rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-700">
          Campaign Manager Notes
        </h2>
        <span className="text-xs text-gray-400">
          Keep recent context and handoff notes here
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[180px_1fr]">
        <div>
          <label className="block text-xs text-gray-500">Author</label>
          <select
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value as CampaignManager)}
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
          <label className="block text-xs text-gray-500">New Weekly Note</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="Add campaign context, red-flag explanations, or anything the team should know."
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900"
          />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={onSave}
          disabled={saving || !note.trim()}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : "Add Note"}
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      <details className="mt-5 rounded-md border border-gray-200 bg-gray-50" open={notes.length === 0}>
        <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-gray-700">
          {notes.length === 0
            ? "No note history yet"
            : `Show note history (${notes.length})`}
        </summary>
        <div className="border-t border-gray-200 px-3 py-3">
          {notes.length === 0 ? (
            <p className="text-sm text-gray-500">
              No campaign manager notes yet.
            </p>
          ) : (
            <div className="space-y-3">
              {notes.map((entry, index) => (
                <article
                  key={entry.id}
                  className="rounded-md border border-gray-200 bg-white px-3 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      {index === 0 ? "Latest Note" : "Previous Note"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {entry.authorName} | {formatDate(entry.createdAt)}
                    </p>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-gray-900">
                    {entry.body}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
