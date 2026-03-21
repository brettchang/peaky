import { NextRequest, NextResponse } from "next/server";
import { getAllCampaignsWithClients, getSetting } from "@/lib/db";
import {
  buildCampaignOperationalInsight,
  campaignEmailInsightSettingKey,
  parseCampaignEmailInsight,
} from "@/lib/campaign-email-insights";
import { sendSlackNotification } from "@/lib/slack";
import { buildCampaignMorningSummaryNotification } from "@/lib/slack-events";
import { hasAlertBeenSent, markAlertSent } from "@/lib/slack-alert-dedupe";
import { getAppBaseUrl } from "@/lib/urls";

const CRON_TZ = "America/New_York";
const TARGET_HOUR = 9;

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

  const now = new Date();
  const localHour = hourInTimeZone(now, CRON_TZ);
  const localDateKey = dateKeyInTimeZone(now, CRON_TZ);
  const dedupeKey = `slack_alert:campaign_morning_summary:${localDateKey}`;

  if (localHour !== TARGET_HOUR) {
    return NextResponse.json({
      sent: false,
      skipped: true,
      reason: `Outside target hour (${TARGET_HOUR}:00 ${CRON_TZ})`,
      localHour,
      localDateKey,
    });
  }

  if (await hasAlertBeenSent(dedupeKey)) {
    return NextResponse.json({
      sent: false,
      skipped: true,
      reason: "Already sent for this local day",
      localHour,
      localDateKey,
    });
  }

  const allCampaigns = await getAllCampaignsWithClients();
  const candidates = allCampaigns.filter((row) => row.campaign.status !== "Wrapped");
  const baseUrl = getAppBaseUrl();

  const rows = await Promise.all(
    candidates.map(async (row) => {
      const raw = await getSetting(campaignEmailInsightSettingKey(row.campaign.id));
      const parsed = parseCampaignEmailInsight(raw);
      const insight = buildCampaignOperationalInsight(row.campaign, parsed);
      return {
        campaignId: row.campaign.id,
        campaignName: row.campaign.name,
        clientName: row.clientName,
        campaignStatus: row.campaign.status,
        insight,
        dashboardUrl: `${baseUrl}/dashboard/${row.campaign.id}`,
      };
    })
  );

  rows.sort((left, right) => {
    const flagDelta =
      right.insight.operationalSummary.totalFlags - left.insight.operationalSummary.totalFlags;
    if (flagDelta !== 0) return flagDelta;
    return left.campaignName.localeCompare(right.campaignName);
  });

  const notification = buildCampaignMorningSummaryNotification({
    dateLabel: formatDateLabel(now),
    rows,
    dashboardUrl: `${baseUrl}/dashboard`,
  });

  await sendSlackNotification(notification);
  await markAlertSent(dedupeKey);

  return NextResponse.json({
    sent: true,
    campaigns: rows.length,
    localHour,
    localDateKey,
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

function hourInTimeZone(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hour12: false,
  }).formatToParts(date);
  return Number(parts.find((p) => p.type === "hour")?.value ?? "0");
}

function formatDateLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CRON_TZ,
    month: "short",
    day: "numeric",
  }).format(date);
}
