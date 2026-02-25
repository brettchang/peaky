export const DISMISSED_TASKS_SETTING_KEY = "dashboard.dismissed-task-ids";

export function parseDismissedTaskIds(raw: string | null): Set<string> {
  if (!raw) return new Set();

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === "string"));
  } catch {
    return new Set();
  }
}

export function serializeDismissedTaskIds(ids: Iterable<string>): string {
  return JSON.stringify(Array.from(new Set(ids)));
}
