import { createHash } from "crypto";
import type { PerformanceStats, PlacementStatus, PlacementType, Publication } from "@/lib/types";
import type { SlackNotificationInput } from "@/lib/slack";
import type { CampaignEmailInsight } from "@/lib/campaign-email-insights";

export interface NoCopyCandidate {
  campaignId: string;
  campaignName: string;
  clientName: string;
  placementId: string;
  placementName: string;
  placementType: PlacementType;
  publication: Publication;
  scheduledDate: string;
  status: PlacementStatus;
  currentCopy: string;
  dashboardUrl: string;
}

export interface MetricsSnapshot {
  totalSends?: number;
  totalOpens?: number;
  uniqueOpens?: number;
  openRate?: number;
  totalClicks?: number;
  uniqueClicks?: number;
}

interface CampaignCreatedInput {
  campaignId: string;
  campaignName: string;
  clientName: string;
  category?: string;
  currency?: string;
  taxEligible?: boolean;
  campaignManager?: string;
  contactEmail?: string;
  adLineItemsSummary: string;
  dashboardUrl: string;
}

interface OnboardingSubmittedInput {
  campaignId: string;
  campaignName: string;
  portalId: string;
  roundId: string;
  placementsCount: number;
  submittedAtIso: string;
  dashboardUrl: string;
}

interface BillingSubmittedInput {
  campaignId: string;
  campaignName: string;
  portalId: string;
  billingCompany?: string;
  billingContactName?: string;
  billingContactEmail?: string;
  ioSigningContactName?: string;
  ioSigningContactEmail?: string;
  submittedAtIso: string;
  dashboardUrl: string;
}

interface PlacementMetricsSyncedInput {
  campaignId: string;
  campaignName: string;
  placementId: string;
  placementName: string;
  placementType: PlacementType;
  publication: Publication;
  scheduledDate?: string;
  beehiivPostId: string;
  stats: PerformanceStats;
  dashboardUrl: string;
}

interface CampaignMorningSummaryRow {
  campaignId: string;
  campaignName: string;
  clientName: string;
  campaignStatus: string;
  insight: CampaignEmailInsight;
  dashboardUrl: string;
}

export function buildCampaignCreatedNotification(
  input: CampaignCreatedInput
): SlackNotificationInput {
  return {
    event: "campaign.created",
    title: `Campaign created: ${input.campaignName}`,
    fields: [
      { label: "Client", value: input.clientName },
      { label: "Campaign ID", value: input.campaignId },
      { label: "Category", value: input.category ?? "Standard" },
      { label: "Currency", value: input.currency ?? "CAD" },
      { label: "Tax Eligible", value: input.taxEligible ?? true },
      { label: "Campaign Manager", value: input.campaignManager },
      { label: "Contact Email", value: input.contactEmail },
      { label: "Ad Line Items", value: input.adLineItemsSummary },
    ],
    linkLabel: "Open Campaign",
    linkUrl: input.dashboardUrl,
  };
}

export function buildOnboardingSubmittedNotification(
  input: OnboardingSubmittedInput
): SlackNotificationInput {
  return {
    event: "form.submitted.onboarding",
    title: `Onboarding submitted: ${input.campaignName}`,
    fields: [
      { label: "Campaign ID", value: input.campaignId },
      { label: "Client Portal ID", value: input.portalId },
      { label: "Form Type", value: "Onboarding" },
      { label: "Round ID", value: input.roundId },
      { label: "Placements", value: input.placementsCount },
      { label: "Submitted At", value: input.submittedAtIso },
    ],
    linkLabel: "Open Campaign",
    linkUrl: input.dashboardUrl,
  };
}

export function buildBillingSubmittedNotification(
  input: BillingSubmittedInput
): SlackNotificationInput {
  return {
    event: "form.submitted.billing",
    title: `Billing onboarding submitted: ${input.campaignName}`,
    fields: [
      { label: "Campaign ID", value: input.campaignId },
      { label: "Client Portal ID", value: input.portalId },
      { label: "Form Type", value: "Billing Onboarding" },
      { label: "Billing Company", value: input.billingCompany },
      { label: "Billing Contact", value: input.billingContactName },
      { label: "Billing Email", value: input.billingContactEmail },
      { label: "IO Signing Contact", value: input.ioSigningContactName },
      { label: "IO Signing Email", value: input.ioSigningContactEmail },
      { label: "Submitted At", value: input.submittedAtIso },
    ],
    linkLabel: "Open Campaign",
    linkUrl: input.dashboardUrl,
  };
}

export function buildNoCopyTMinusFiveNotification(
  input: NoCopyCandidate
): SlackNotificationInput {
  return {
    event: "placement.no_copy_t_minus_5",
    title: `No copy 5 days out: ${input.campaignName}`,
    fields: [
      { label: "Client", value: input.clientName },
      { label: "Campaign ID", value: input.campaignId },
      { label: "Placement ID", value: input.placementId },
      { label: "Placement", value: input.placementName },
      { label: "Type", value: input.placementType },
      { label: "Publication", value: input.publication },
      { label: "Scheduled Date", value: input.scheduledDate },
      { label: "Status", value: input.status },
    ],
    linkLabel: "Open Placement",
    linkUrl: input.dashboardUrl,
  };
}

export function buildPlacementMetricsSyncedNotification(
  input: PlacementMetricsSyncedInput
): SlackNotificationInput {
  return {
    event: "placement.metrics.synced",
    title: `Beehiiv metrics synced: ${input.campaignName}`,
    fields: [
      { label: "Campaign ID", value: input.campaignId },
      { label: "Placement ID", value: input.placementId },
      { label: "Placement", value: input.placementName },
      { label: "Type", value: input.placementType },
      { label: "Publication", value: input.publication },
      { label: "Scheduled Date", value: input.scheduledDate },
      { label: "Beehiiv Post ID", value: input.beehiivPostId },
      { label: "Total Sends", value: input.stats.totalSends },
      { label: "Total Opens", value: input.stats.totalOpens },
      { label: "Unique Opens", value: input.stats.uniqueOpens },
      { label: "Open Rate", value: formatRate(input.stats.openRate) },
      { label: "Total Clicks", value: input.stats.totalClicks },
      { label: "Unique Clicks", value: input.stats.uniqueClicks },
    ],
    linkLabel: "Open Placement",
    linkUrl: input.dashboardUrl,
  };
}

export function buildCampaignMorningSummaryNotification(input: {
  dateLabel: string;
  rows: CampaignMorningSummaryRow[];
  dashboardUrl: string;
}): SlackNotificationInput {
  const blocks: Array<Record<string, unknown>> = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `Morning Campaign Summary (${input.dateLabel})`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Event:* campaign.morning_summary\n<${input.dashboardUrl}|Open Dashboard>`,
      },
    },
  ];

  for (const row of input.rows) {
    const topFlags = row.insight.flags.slice(0, 2).map((flag) => flag.title);
    const summaryLine = [
      `*Status:* ${row.campaignStatus}`,
      `*Flags:* ${row.insight.operationalSummary.totalFlags}`,
      `*Scheduled:* ${row.insight.operationalSummary.scheduledPlacements}/${row.insight.operationalSummary.totalPlacements}`,
    ].join(" | ");
    const riskLine =
      topFlags.length > 0
        ? `*Watch:* ${topFlags.join("; ")}`
        : "*Watch:* No major flags";

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*${row.campaignName}* (${row.clientName})\n` +
          `${summaryLine}\n` +
          `${riskLine}\n` +
          `<${row.dashboardUrl}|Open campaign>`,
      },
    });
  }

  return {
    event: "campaign.morning_summary",
    title: `Morning Campaign Summary (${input.dateLabel})`,
    linkLabel: "Open Dashboard",
    linkUrl: input.dashboardUrl,
    blocks,
  };
}

export function buildMetricsSnapshotHash(stats: MetricsSnapshot): string {
  return createHash("sha256")
    .update(JSON.stringify(stats))
    .digest("hex")
    .slice(0, 16);
}

export function isApprovedPlacementStatus(status: PlacementStatus): boolean {
  return (
    status === "Approved" ||
    status === "Approved Script" ||
    status === "Audio Approved" ||
    status === "Approved Interview"
  );
}

interface EmailDraftReadyInput {
  threadId: string;
  senderEmail: string;
  senderName: string;
  subject: string;
  matchedCampaignNames: string[];
  snippet: string;
}

export function buildEmailDraftReadyNotification(
  input: EmailDraftReadyInput
): SlackNotificationInput {
  const campaignInfo =
    input.matchedCampaignNames.length > 0
      ? input.matchedCampaignNames.join(", ")
      : "No campaign match";

  return {
    event: "email_agent.draft_ready",
    title: `Email draft ready for review`,
    fields: [
      { label: "From", value: input.senderName || input.senderEmail },
      { label: "Subject", value: input.subject },
      { label: "Matched Campaigns", value: campaignInfo },
      { label: "Preview", value: input.snippet },
    ],
    linkLabel: "Open Gmail Drafts",
    linkUrl: "https://mail.google.com/mail/u/0/#drafts",
  };
}

function formatRate(rate: number | undefined): string | undefined {
  if (rate === undefined || rate === null) return undefined;
  return `${rate.toFixed(2)}%`;
}
