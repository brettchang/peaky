interface PlacementPortalMeta {
  scheduledEndDate?: string;
  interviewScheduled?: boolean;
}

const PLACEMENT_META_START = "<!-- placement-meta:start -->";
const PLACEMENT_META_END = "<!-- placement-meta:end -->";

export function extractPlacementMeta(notes?: string | null): {
  cleanNotes: string | null;
  meta: PlacementPortalMeta;
} {
  if (!notes) return { cleanNotes: null, meta: {} };

  const start = notes.indexOf(PLACEMENT_META_START);
  const end = notes.indexOf(PLACEMENT_META_END);
  if (start === -1 || end === -1 || end < start) {
    return { cleanNotes: notes.trim() || null, meta: {} };
  }

  const before = notes.slice(0, start).trim();
  const after = notes.slice(end + PLACEMENT_META_END.length).trim();
  const rawMeta = notes
    .slice(start + PLACEMENT_META_START.length, end)
    .trim();

  let meta: PlacementPortalMeta = {};
  try {
    meta = JSON.parse(rawMeta) as PlacementPortalMeta;
  } catch {
    meta = {};
  }

  const cleanNotes = [before, after].filter(Boolean).join("\n\n").trim() || null;
  return { cleanNotes, meta };
}

export function attachPlacementMeta(
  cleanNotes: string | null,
  meta: PlacementPortalMeta
): string {
  const hasMeta =
    typeof meta.scheduledEndDate === "string" ||
    typeof meta.interviewScheduled === "boolean";
  if (!hasMeta) return cleanNotes ?? "";

  const normalized: PlacementPortalMeta = {};
  if (meta.scheduledEndDate) normalized.scheduledEndDate = meta.scheduledEndDate;
  if (typeof meta.interviewScheduled === "boolean") {
    normalized.interviewScheduled = meta.interviewScheduled;
  }

  const block = `${PLACEMENT_META_START}\n${JSON.stringify(normalized)}\n${PLACEMENT_META_END}`;
  if (!cleanNotes) return block;
  return `${cleanNotes}\n\n${block}`;
}
