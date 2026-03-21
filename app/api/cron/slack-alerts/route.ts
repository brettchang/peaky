import { NextRequest, NextResponse } from "next/server";
import { getPlacementsScheduledOn } from "@/lib/db";
import { sendSlackNotification } from "@/lib/slack";
import { getAppBaseUrl } from "@/lib/urls";
import {
  buildNoCopyTMinusFiveNotification,
  isApprovedPlacementStatus,
} from "@/lib/slack-events";
import { hasAlertBeenSent, markAlertSent } from "@/lib/slack-alert-dedupe";

const CRON_TZ = "America/New_York";

export async function POST(request: NextRequest) {
  return runCron(request);
}

export async function GET(request: NextRequest) {
  return runCron(request);
}

async function runCron(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization") ?? "";
  const expectedAuth = cronSecret ? `Bearer ${cronSecret}` : "";

  if (!cronSecret || authHeader !== expectedAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = dateKeyInTimeZone(new Date(), CRON_TZ);
  const targetDate = addDays(today, 5);
  const scheduledPlacements = await getPlacementsScheduledOn(targetDate);

  let sent = 0;
  let skipped = 0;

  for (const row of scheduledPlacements) {
    const hasCopy = row.currentCopy.trim().length > 0;
    const approved = isApprovedPlacementStatus(row.status);
    if (hasCopy || approved) {
      skipped++;
      continue;
    }

    const dedupeKey = `slack_alert:no_copy_t_minus_5:${row.placementId}:${row.scheduledDate}`;
    if (await hasAlertBeenSent(dedupeKey)) {
      skipped++;
      continue;
    }

    try {
      await sendSlackNotification(
        buildNoCopyTMinusFiveNotification({
          campaignId: row.campaignId,
          campaignName: row.campaignName,
          clientName: row.clientName,
          placementId: row.placementId,
          placementName: row.placementName,
          placementType: row.placementType,
          publication: row.publication,
          scheduledDate: row.scheduledDate,
          status: row.status,
          currentCopy: row.currentCopy,
          dashboardUrl: `${getAppBaseUrl()}/dashboard/${row.campaignId}/${row.placementId}`,
        })
      );
      await markAlertSent(dedupeKey);
      sent++;
    } catch (error) {
      console.error("Slack notification failed (placement.no_copy_t_minus_5):", error);
      skipped++;
    }
  }

  return NextResponse.json({
    checked: scheduledPlacements.length,
    sent,
    skipped,
    targetDate,
    timezone: CRON_TZ,
  });
}

function dateKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
