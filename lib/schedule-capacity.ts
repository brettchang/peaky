import type { DayCapacity, Placement, PlacementType, Publication } from "@/lib/types";
import { DAILY_CAPACITY_LIMITS } from "@/lib/types";

export const CLIENT_SCHEDULE_WINDOW_DAYS = 30;
export const ADMIN_SCHEDULE_WINDOW_DAYS = 365;

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getTodayDateKey(): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return toDateKey(today);
}

export function isPastDateKey(date: string, todayKey = getTodayDateKey()): boolean {
  return date < todayKey;
}

function isDateSelectable(date: string, todayKey: string): boolean {
  return !isPastDateKey(date, todayKey);
}

export function getAvailableCapacityDates({
  capacityDays,
  publication,
  type,
  todayKey = getTodayDateKey(),
  getReservedCount,
}: {
  capacityDays: DayCapacity[];
  publication: Publication;
  type: PlacementType;
  todayKey?: string;
  getReservedCount?: (date: string) => number;
}): string[] {
  const limit = DAILY_CAPACITY_LIMITS[type];

  return capacityDays
    .filter((day) => {
      if (!isDateSelectable(day.date, todayKey)) return false;

      if (limit === null) return true;

      const slot = day.slots.find(
        (entry) => entry.publication === publication && entry.type === type
      );
      if (!slot) return false;

      const reservedCount = getReservedCount?.(day.date) ?? 0;
      return (slot.available ?? 0) - reservedCount > 0;
    })
    .map((day) => day.date);
}

export function getPlacementAvailableCapacityDates({
  capacityDays,
  placement,
  todayKey = getTodayDateKey(),
  getReservedCount,
}: {
  capacityDays: DayCapacity[];
  placement: Pick<Placement, "publication" | "type">;
  todayKey?: string;
  getReservedCount?: (date: string) => number;
}): string[] {
  return getAvailableCapacityDates({
    capacityDays,
    publication: placement.publication,
    type: placement.type,
    todayKey,
    getReservedCount,
  });
}

export function ensureDateOption(
  dates: string[],
  currentDate?: string | null
): string[] {
  if (!currentDate || dates.includes(currentDate)) {
    return dates;
  }

  return [currentDate, ...dates];
}
