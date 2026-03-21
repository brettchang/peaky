import { NextRequest, NextResponse } from "next/server";
import { getAllCampaignsWithClients, getSetting, upsertSetting } from "@/lib/db";
import {
  buildCampaignEmailInsight,
  buildCampaignOperationalInsight,
  campaignEmailInsightSettingKey,
} from "@/lib/campaign-email-insights";
import { AI_CAMPAIGN_EMAIL_SUMMARY_PROMPT_KEY } from "@/lib/ai-constants";

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

  const allCampaigns = await getAllCampaignsWithClients();
  const customSummaryPrompt = await getSetting(AI_CAMPAIGN_EMAIL_SUMMARY_PROMPT_KEY);
  const maxCampaigns = resolveMaxCampaigns();
  const candidates = allCampaigns
    .filter((row) => row.campaign.status !== "Wrapped")
    .sort((left, right) => {
      const leftActive = left.campaign.status === "Active" ? 1 : 0;
      const rightActive = right.campaign.status === "Active" ? 1 : 0;
      return rightActive - leftActive;
    })
    .slice(0, maxCampaigns);

  let processed = 0;
  const skipped = 0;
  let skippedNoContacts = 0;
  const failures: Array<{ campaignId: string; error: string }> = [];

  for (const row of candidates) {
    const campaign = row.campaign;
    const contactEmails = extractContactEmails(campaign);

    try {
      const insight =
        contactEmails.length > 0
          ? await buildCampaignEmailInsight({
              campaign,
              clientName: row.clientName,
              contactEmails,
              summaryPrompt: customSummaryPrompt ?? undefined,
            })
          : (() => {
              skippedNoContacts += 1;
              return buildCampaignOperationalInsight(campaign);
            })();
      await upsertSetting(
        campaignEmailInsightSettingKey(campaign.id),
        JSON.stringify(insight)
      );
      processed += 1;
    } catch (error) {
      failures.push({
        campaignId: campaign.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({
    checked: candidates.length,
    processed,
    skipped,
    skippedNoContacts,
    aiEnabled: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    customPromptLoaded: Boolean(customSummaryPrompt?.trim()),
    customPromptLength: customSummaryPrompt?.length ?? 0,
    failures,
  });
}

function extractContactEmails(campaign: {
  contactEmail?: string;
  contacts?: Array<{ email: string }>;
}): string[] {
  const candidates = new Set<string>();
  if (campaign.contactEmail) {
    candidates.add(campaign.contactEmail.trim().toLowerCase());
  }

  for (const contact of campaign.contacts ?? []) {
    if (!contact.email) continue;
    candidates.add(contact.email.trim().toLowerCase());
  }

  return Array.from(candidates).filter(Boolean);
}

function resolveMaxCampaigns(): number {
  const raw = process.env.CAMPAIGN_EMAIL_MAX_CAMPAIGNS?.trim();
  if (!raw) return 500;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 500;
  return Math.floor(parsed);
}
