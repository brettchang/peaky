import type { Placement } from "./types";
import { isClientCopyPlacement } from "./types";

const EASTERN_TIME_ZONE = "America/New_York";
const PLACEMENT_RUN_HOUR = 6;
const CLIENT_EDIT_WINDOW_HOURS = 12;

type ZonedDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}

function getZonedParts(date: Date, timeZone: string): ZonedDateTime {
  const parts = getFormatter(timeZone).formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: getPart("year"),
    month: getPart("month"),
    day: getPart("day"),
    hour: getPart("hour"),
    minute: getPart("minute"),
    second: getPart("second"),
  };
}

function zonedDateTimeToUtc(dateTime: ZonedDateTime, timeZone: string): Date {
  const targetUtcValue = Date.UTC(
    dateTime.year,
    dateTime.month - 1,
    dateTime.day,
    dateTime.hour,
    dateTime.minute,
    dateTime.second
  );

  let utcValue = targetUtcValue;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const zoned = getZonedParts(new Date(utcValue), timeZone);
    const zonedUtcValue = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
      zoned.second
    );
    const delta = targetUtcValue - zonedUtcValue;
    if (delta === 0) break;
    utcValue += delta;
  }

  return new Date(utcValue);
}

export function getPlacementRunTimeUtc(scheduledDate: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(scheduledDate);
  if (!match) return null;

  const [, year, month, day] = match;
  return zonedDateTimeToUtc(
    {
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hour: PLACEMENT_RUN_HOUR,
      minute: 0,
      second: 0,
    },
    EASTERN_TIME_ZONE
  );
}

export function getPlacementClientEditCutoffUtc(
  scheduledDate?: string
): Date | null {
  if (!scheduledDate) return null;
  const runTime = getPlacementRunTimeUtc(scheduledDate);
  if (!runTime) return null;
  return new Date(
    runTime.getTime() - CLIENT_EDIT_WINDOW_HOURS * 60 * 60 * 1000
  );
}

export function canClientEditApprovedPlacementCopy(
  placement: Pick<Placement, "status" | "scheduledDate" | "copyProducer">
): boolean {
  if (isClientCopyPlacement(placement)) return true;
  if (placement.status !== "Approved") return false;

  const cutoff = getPlacementClientEditCutoffUtc(placement.scheduledDate);
  if (!cutoff) return true;
  return Date.now() < cutoff.getTime();
}

export function formatPlacementClientEditCutoff(
  scheduledDate?: string
): string | null {
  const cutoff = getPlacementClientEditCutoffUtc(scheduledDate);
  if (!cutoff) return null;

  return new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(cutoff);
}
