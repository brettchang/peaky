const CAMPAIGN_MANAGER_NOTES_START = "<!-- campaign-manager-notes:start -->";
const CAMPAIGN_MANAGER_NOTES_END = "<!-- campaign-manager-notes:end -->";

function normalizeSection(value?: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

export function extractCampaignManagerNotes(notes?: string | null): {
  managerNotes?: string;
  notesWithoutManagerNotes: string | null;
} {
  const source = normalizeSection(notes);
  if (!source) {
    return {
      managerNotes: undefined,
      notesWithoutManagerNotes: null,
    };
  }

  const start = source.lastIndexOf(CAMPAIGN_MANAGER_NOTES_START);
  const end =
    start === -1 ? -1 : source.indexOf(CAMPAIGN_MANAGER_NOTES_END, start);

  if (start === -1 || end === -1 || end < start) {
    return {
      managerNotes: undefined,
      notesWithoutManagerNotes: source,
    };
  }

  const managerNotes =
    normalizeSection(
      source.slice(start + CAMPAIGN_MANAGER_NOTES_START.length, end)
    ) ?? undefined;
  const before = source.slice(0, start).trim();
  const after = source.slice(end + CAMPAIGN_MANAGER_NOTES_END.length).trim();
  const notesWithoutManagerNotes = normalizeSection(
    [before, after].filter(Boolean).join("\n\n")
  );

  return {
    managerNotes,
    notesWithoutManagerNotes,
  };
}

export function attachCampaignManagerNotes(
  notes: string | null | undefined,
  managerNotes?: string | null
): string {
  const cleanNotes = normalizeSection(notes);
  const cleanManagerNotes = normalizeSection(managerNotes);

  if (!cleanManagerNotes) return cleanNotes ?? "";

  const block = `${CAMPAIGN_MANAGER_NOTES_START}\n${cleanManagerNotes}\n${CAMPAIGN_MANAGER_NOTES_END}`;
  if (!cleanNotes) return block;
  return `${cleanNotes}\n\n${block}`;
}
