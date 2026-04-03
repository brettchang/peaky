import { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import * as z from "zod/v4";
import {
  createCampaign,
  getAllCampaignsWithClients,
  getCampaignById,
  getPlacementsScheduledOn,
  getSetting,
  updatePlacementStatus,
  upsertSetting,
} from "../lib/db";
import {
  listThreads,
  getThreadById,
} from "../lib/email/db";
import {
  ensurePrimaryMailbox,
  syncMailboxThreads,
  createManualDraft,
  rerunDraftAgent,
  approveDraft,
  rejectDraft,
  sendDraft,
} from "../lib/email/service";
import { sendSlackNotification } from "../lib/slack";
import {
  buildNoCopyTMinusFiveNotification,
  buildCampaignMorningSummaryNotification,
  isApprovedPlacementStatus,
} from "../lib/slack-events";
import { hasAlertBeenSent, markAlertSent } from "../lib/slack-alert-dedupe";
import { getAppBaseUrl } from "../lib/urls";
import {
  buildCampaignEmailInsight,
  buildCampaignOperationalInsight,
  campaignEmailInsightSettingKey,
  parseCampaignEmailInsight,
} from "../lib/campaign-email-insights";
import { AI_CAMPAIGN_EMAIL_SUMMARY_PROMPT_KEY } from "../lib/ai-constants";
import { buildDashboardTasks } from "../lib/dashboard-tasks";

const SERVER_NAME = "peak-client-portal-mcp";
const SERVER_VERSION = "0.1.0";
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST?.trim() || "0.0.0.0";
const MCP_API_KEY = process.env.MCP_API_KEY;

const placementStatuses = [
  "New Campaign",
  "Copywriting in Progress",
  "Peak Team Review Complete",
  "Sent for Approval",
  "Approved",
  "Onboarding Requested",
  "Drafting Script",
  "Script Review by Client",
  "Approved Script",
  "Audio Sent for Approval",
  "Audio Sent",
  "Audio Approved",
  "Drafting Questions",
  "Questions In Review",
  "Client Reviewing Interview",
  "Revising for Client",
  "Approved Interview",
] as const;

const placementTypes = [
  "Primary",
  "Secondary",
  "Peak Picks",
  "Beehiv",
  "Smart Links",
  "BLS",
  "Podcast Ad",
  ":30 Pre-Roll",
  ":30 Mid-Roll",
  "15 Minute Interview",
] as const;

const publications = ["The Peak", "Peak Money", "Peak Daily Podcast"] as const;
const campaignCategories = ["Standard", "Evergreen"] as const;
const campaignCurrencies = ["CAD", "USD"] as const;
const campaignManagers = ["Matheus", "Brett", "Will"] as const;

function isAuthorized(req: Request): boolean {
  if (!MCP_API_KEY) return true;
  const header = req.headers.authorization;
  return header === `Bearer ${MCP_API_KEY}`;
}

function authFailure(res: Response): void {
  res.status(401).json({
    jsonrpc: "2.0",
    error: {
      code: -32001,
      message: "Unauthorized",
    },
    id: null,
  });
}

function jsonRpcMethodNotAllowed(res: Response): void {
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed.",
    },
    id: null,
  });
}

function getServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  server.registerTool(
    "list_campaigns",
    {
      title: "List Campaigns",
      description:
        "List campaigns with optional filtering and paging. Returns newest first.",
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .default(25)
          .describe("Maximum campaigns to return"),
        clientName: z
          .string()
          .optional()
          .describe("Optional case-insensitive client name filter"),
        status: z
          .string()
          .optional()
          .describe("Optional campaign status filter"),
      },
      outputSchema: {
        campaigns: z.array(
          z.object({
            campaignId: z.string(),
            campaignName: z.string(),
            status: z.string(),
            category: z.enum(campaignCategories),
            clientName: z.string(),
            clientPortalId: z.string(),
            createdAt: z.string(),
            placementCount: z.number(),
          })
        ),
      },
    },
    async ({ limit, clientName, status }) => {
      const rows = await getAllCampaignsWithClients();
      const filtered = rows
        .filter((row) =>
          clientName
            ? row.clientName.toLowerCase().includes(clientName.toLowerCase())
            : true
        )
        .filter((row) => (status ? row.campaign.status === status : true))
        .sort(
          (a, b) =>
            new Date(b.campaign.createdAt).getTime() -
            new Date(a.campaign.createdAt).getTime()
        )
        .slice(0, limit)
        .map((row) => ({
          campaignId: row.campaign.id,
          campaignName: row.campaign.name,
          status: row.campaign.status,
          category: row.campaign.category,
          clientName: row.clientName,
          clientPortalId: row.clientPortalId,
          createdAt: row.campaign.createdAt,
          placementCount: row.campaign.placements.length,
        }));

      return {
        structuredContent: { campaigns: filtered },
        content: [
          {
            type: "text",
            text: `Returned ${filtered.length} campaign(s).`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "get_campaign",
    {
      title: "Get Campaign",
      description: "Fetch full campaign details by campaign ID.",
      inputSchema: {
        campaignId: z.string().min(1),
      },
    },
    async ({ campaignId }) => {
      const campaign = await getCampaignById(campaignId);
      if (!campaign) {
        return {
          content: [{ type: "text", text: `Campaign not found: ${campaignId}` }],
          isError: true,
        };
      }

      return {
        structuredContent: { campaign },
        content: [
          {
            type: "text",
            text: `Found campaign "${campaign.name}" (${campaign.id}).`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "create_campaign",
    {
      title: "Create Campaign",
      description:
        "Create a new campaign for a client and optionally pre-create placements from ad line items.",
      inputSchema: {
        clientName: z.string().min(1),
        name: z.string().min(1),
        category: z.enum(campaignCategories).optional(),
        salesPerson: z.string().optional(),
        campaignManager: z.enum(campaignManagers),
        currency: z.enum(campaignCurrencies).optional(),
        taxEligible: z.boolean().optional(),
        contactName: z.string().optional(),
        contactEmail: z.string().email().optional(),
        notes: z.string().optional(),
        adLineItems: z
          .array(
            z.object({
              quantity: z.number().int().min(1),
              type: z.enum(placementTypes),
              publication: z.enum(publications).optional(),
              pricePerUnit: z.number(),
            })
          )
          .optional(),
      },
    },
    async (args) => {
      const campaign = await createCampaign(args);
      return {
        structuredContent: { campaign },
        content: [
          {
            type: "text",
            text: `Created campaign "${campaign.name}" (${campaign.id}).`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "update_placement_status",
    {
      title: "Update Placement Status",
      description: "Update a placement's workflow status.",
      inputSchema: {
        campaignId: z.string().min(1),
        placementId: z.string().min(1),
        status: z.enum(placementStatuses),
      },
    },
    async ({ campaignId, placementId, status }) => {
      const ok = await updatePlacementStatus(campaignId, placementId, status);
      if (!ok) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to update status for placement ${placementId} in campaign ${campaignId}.`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `Updated placement ${placementId} to "${status}".`,
          },
        ],
      };
    }
  );

  // ── Email Tools ──────────────────────────────────────────────────────

  server.registerTool(
    "list_email_threads",
    {
      title: "List Email Threads",
      description:
        "List email threads from the adops mailbox. Returns threads with subject, participants, response state, and current draft status.",
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("Maximum threads to return"),
        needsAttention: z
          .boolean()
          .optional()
          .describe("Filter to only threads needing attention"),
      },
    },
    async ({ limit, needsAttention }) => {
      const mailbox = await ensurePrimaryMailbox();
      const allThreads = await listThreads(mailbox.id);

      const filtered = allThreads
        .filter((t) =>
          needsAttention !== undefined ? t.needsAttention === needsAttention : true
        )
        .sort(
          (a, b) =>
            new Date(b.lastMessageAt ?? b.createdAt).getTime() -
            new Date(a.lastMessageAt ?? a.createdAt).getTime()
        )
        .slice(0, limit)
        .map((t) => ({
          threadId: t.id,
          subject: t.subject,
          snippet: t.snippet,
          participants: t.participants,
          responseState: t.responseState,
          needsAttention: t.needsAttention,
          noReplyNeeded: t.noReplyNeeded,
          lastMessageAt: t.lastMessageAt,
          hasDraft: !!t.currentDraft,
          draftStatus: t.currentDraft?.status ?? null,
        }));

      return {
        structuredContent: { threads: filtered },
        content: [
          {
            type: "text",
            text: `Returned ${filtered.length} thread(s).`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "get_email_thread",
    {
      title: "Get Email Thread",
      description:
        "Fetch full thread details including messages, current draft, linked campaigns, and agent run info.",
      inputSchema: {
        threadId: z.string().min(1).describe("The thread ID"),
      },
    },
    async ({ threadId }) => {
      const thread = await getThreadById(threadId);
      if (!thread) {
        return {
          content: [{ type: "text", text: `Thread not found: ${threadId}` }],
          isError: true,
        };
      }

      const summary = {
        threadId: thread.id,
        subject: thread.subject,
        participants: thread.participants,
        responseState: thread.responseState,
        needsAttention: thread.needsAttention,
        lastMessageAt: thread.lastMessageAt,
        linkedCampaigns: thread.links.map((l) => ({
          campaignId: l.campaignId,
          campaignName: l.campaign?.campaign?.name,
          confidence: l.confidence,
          matchReason: l.matchReason,
        })),
        messages: thread.messages.map((m) => ({
          id: m.id,
          direction: m.direction,
          fromName: m.fromName,
          fromEmail: m.fromEmail,
          subject: m.subject,
          bodyText: m.bodyText,
          sentAt: m.sentAt,
        })),
        currentDraft: thread.currentDraft
          ? {
              draftId: thread.currentDraft.id,
              status: thread.currentDraft.status,
              subject: thread.currentDraft.subject,
              bodyHtml: thread.currentDraft.bodyHtml,
              bodyText: thread.currentDraft.bodyText,
              explanation: thread.currentDraft.explanationSummary,
            }
          : null,
        latestRun: thread.latestRun
          ? {
              runId: thread.latestRun.id,
              status: thread.latestRun.status,
              confidence: thread.latestRun.confidence,
              rationaleSummary: thread.latestRun.rationaleSummary,
              missingDataFlags: thread.latestRun.missingDataFlags,
              safetyFlags: thread.latestRun.safetyFlags,
            }
          : null,
      };

      return {
        structuredContent: { thread: summary },
        content: [
          {
            type: "text",
            text: `Thread "${thread.subject}" — ${thread.messages.length} message(s), state: ${thread.responseState}.`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "sync_email_threads",
    {
      title: "Sync Email Threads",
      description:
        "Trigger a sync of the adops mailbox. Pulls new messages and auto-links threads to campaigns.",
      inputSchema: {},
    },
    async () => {
      const threads = await syncMailboxThreads();
      return {
        content: [
          {
            type: "text",
            text: `Synced ${threads.length} thread(s) from mailbox.`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "create_email_draft",
    {
      title: "Create Email Draft",
      description:
        "Manually create a reply draft for a thread. The draft is saved for human review before sending.",
      inputSchema: {
        threadId: z.string().min(1).describe("The thread to reply to"),
        subject: z.string().min(1).describe("Email subject line"),
        bodyText: z.string().min(1).describe("Plain-text email body"),
      },
    },
    async ({ threadId, subject, bodyText }) => {
      const thread = await createManualDraft({ threadId, subject, bodyText });
      const draft = thread.currentDraft;

      return {
        structuredContent: {
          threadId: thread.id,
          draftId: draft?.id,
          status: draft?.status,
        },
        content: [
          {
            type: "text",
            text: `Created draft for thread "${thread.subject}" (draft ${draft?.id}). Status: ${draft?.status}. Must be approved before sending.`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "generate_ai_draft",
    {
      title: "Generate AI Draft",
      description:
        "Run the AI email agent on a thread to auto-generate a reply draft using campaign context, knowledge base, and available tools. Invalidates any existing draft.",
      inputSchema: {
        threadId: z.string().min(1).describe("The thread to generate a draft for"),
      },
    },
    async ({ threadId }) => {
      const thread = await rerunDraftAgent(threadId);
      const draft = thread.currentDraft;
      const run = thread.latestRun;

      return {
        structuredContent: {
          threadId: thread.id,
          draftId: draft?.id,
          draftStatus: draft?.status,
          confidence: run?.confidence,
          explanation: run?.rationaleSummary,
          missingDataFlags: run?.missingDataFlags,
          safetyFlags: run?.safetyFlags,
        },
        content: [
          {
            type: "text",
            text: `Generated AI draft for "${thread.subject}" — confidence: ${run?.confidence ?? "N/A"}, status: ${draft?.status}. Review before approving.`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "approve_email_draft",
    {
      title: "Approve Email Draft",
      description:
        "Approve a draft so it can be sent. Does NOT send it — use send_email_draft after approving.",
      inputSchema: {
        draftId: z.string().min(1).describe("The draft ID to approve"),
        approvedBy: z
          .string()
          .optional()
          .describe("Name of person approving (for audit trail)"),
      },
    },
    async ({ draftId, approvedBy }) => {
      await approveDraft(draftId, approvedBy);
      return {
        content: [
          {
            type: "text",
            text: `Draft ${draftId} approved${approvedBy ? ` by ${approvedBy}` : ""}. Use send_email_draft to send it.`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "reject_email_draft",
    {
      title: "Reject Email Draft",
      description:
        "Reject a draft. The thread will be eligible for a new AI-generated draft.",
      inputSchema: {
        draftId: z.string().min(1).describe("The draft ID to reject"),
      },
    },
    async ({ draftId }) => {
      await rejectDraft(draftId);
      return {
        content: [
          {
            type: "text",
            text: `Draft ${draftId} rejected. You can generate a new AI draft for this thread.`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "send_email_draft",
    {
      title: "Send Email Draft",
      description:
        "Send an approved draft. Draft must be in 'approved' status first.",
      inputSchema: {
        draftId: z.string().min(1).describe("The approved draft ID to send"),
      },
    },
    async ({ draftId }) => {
      await sendDraft(draftId);
      return {
        content: [
          {
            type: "text",
            text: `Draft ${draftId} sent successfully.`,
          },
        ],
      };
    }
  );

  // ── Daily Operations Tools ────────────────────────────────────────

  server.registerTool(
    "run_slack_alerts",
    {
      title: "Run Slack Alerts",
      description:
        "Check for placements scheduled within 5 days that are missing copy and send Slack alerts. Deduplicates so the same alert is never sent twice.",
      inputSchema: {},
    },
    async () => {
      const CRON_TZ = "America/New_York";
      const now = new Date();
      const todayKey = dateKeyInTimeZone(now, CRON_TZ);
      const targetDate = addDays(todayKey, 5);
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
        } catch {
          skipped++;
        }
      }

      return {
        structuredContent: {
          checked: scheduledPlacements.length,
          sent,
          skipped,
          targetDate,
          timezone: CRON_TZ,
        },
        content: [
          {
            type: "text",
            text: `Checked ${scheduledPlacements.length} placement(s) scheduled for ${targetDate}. Sent ${sent} alert(s), skipped ${skipped}.`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "run_morning_summary",
    {
      title: "Run Morning Summary",
      description:
        "Generate and send the daily campaign morning summary to Slack. Includes operational flags, placement status, and email insights for all active campaigns. Deduplicates per day.",
      inputSchema: {
        force: z
          .boolean()
          .optional()
          .describe(
            "Skip the time-of-day and deduplication checks and send the summary now"
          ),
      },
    },
    async ({ force }) => {
      const CRON_TZ = "America/New_York";
      const now = new Date();
      const localDateKey = dateKeyInTimeZone(now, CRON_TZ);
      const dedupeKey = `slack_alert:campaign_morning_summary:${localDateKey}`;

      if (!force && (await hasAlertBeenSent(dedupeKey))) {
        return {
          content: [
            {
              type: "text",
              text: `Morning summary already sent for ${localDateKey}. Use force: true to resend.`,
            },
          ],
        };
      }

      const allCampaigns = await getAllCampaignsWithClients();
      const candidates = allCampaigns.filter(
        (row) => row.campaign.status !== "Wrapped"
      );
      const baseUrl = getAppBaseUrl();

      const rows = await Promise.all(
        candidates.map(async (row) => {
          const raw = await getSetting(
            campaignEmailInsightSettingKey(row.campaign.id)
          );
          const parsed = parseCampaignEmailInsight(raw);
          const insight = buildCampaignOperationalInsight(
            row.campaign,
            parsed
          );
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
          right.insight.operationalSummary.totalFlags -
          left.insight.operationalSummary.totalFlags;
        if (flagDelta !== 0) return flagDelta;
        return left.campaignName.localeCompare(right.campaignName);
      });

      const dateLabel = new Intl.DateTimeFormat("en-US", {
        timeZone: CRON_TZ,
        month: "short",
        day: "numeric",
      }).format(now);

      const notification = buildCampaignMorningSummaryNotification({
        dateLabel,
        rows,
        dashboardUrl: `${baseUrl}/dashboard`,
      });

      await sendSlackNotification(notification);
      await markAlertSent(dedupeKey);

      return {
        structuredContent: {
          sent: true,
          campaigns: rows.length,
          localDateKey,
          timezone: CRON_TZ,
        },
        content: [
          {
            type: "text",
            text: `Sent morning summary for ${dateLabel} covering ${rows.length} campaign(s).`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "run_campaign_insights",
    {
      title: "Run Campaign Insights",
      description:
        "Build AI-generated email and operational insights for all active campaigns. Analyzes email correspondence, placement scheduling, copy status, onboarding, and approvals. Results are stored and used by the morning summary.",
      inputSchema: {
        campaignId: z
          .string()
          .optional()
          .describe(
            "Process a single campaign by ID instead of all campaigns"
          ),
      },
    },
    async ({ campaignId }) => {
      const allCampaigns = await getAllCampaignsWithClients();
      const customSummaryPrompt = await getSetting(
        AI_CAMPAIGN_EMAIL_SUMMARY_PROMPT_KEY
      );

      const candidates = campaignId
        ? allCampaigns.filter((row) => row.campaign.id === campaignId)
        : allCampaigns
            .filter((row) => row.campaign.status !== "Wrapped")
            .sort((left, right) => {
              const leftActive = left.campaign.status === "Active" ? 1 : 0;
              const rightActive = right.campaign.status === "Active" ? 1 : 0;
              return rightActive - leftActive;
            });

      let processed = 0;
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
              : buildCampaignOperationalInsight(campaign);

          await upsertSetting(
            campaignEmailInsightSettingKey(campaign.id),
            JSON.stringify(insight)
          );
          processed++;
        } catch (error) {
          failures.push({
            campaignId: campaign.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return {
        structuredContent: {
          checked: candidates.length,
          processed,
          failures,
        },
        content: [
          {
            type: "text",
            text: `Processed insights for ${processed}/${candidates.length} campaign(s).${failures.length > 0 ? ` ${failures.length} failed.` : ""}`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "get_dashboard_tasks",
    {
      title: "Get Dashboard Tasks",
      description:
        "Get the prioritized list of operational tasks: client feedback to review, copy needing Peak team review, upcoming placements awaiting client approval, and billing invoices needed.",
      inputSchema: {},
    },
    async () => {
      const data = await getAllCampaignsWithClients();
      const tasks = buildDashboardTasks(data);

      return {
        structuredContent: {
          tasks: tasks.map((t) => ({
            id: t.id,
            type: t.type,
            title: t.title,
            detail: t.detail,
            campaignName: t.campaignName,
            clientName: t.clientName,
            urgent: t.urgent ?? false,
            href: t.href,
          })),
        },
        content: [
          {
            type: "text",
            text: `Found ${tasks.length} task(s): ${tasks.filter((t) => t.urgent).length} urgent.`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "get_campaign_insight",
    {
      title: "Get Campaign Insight",
      description:
        "Read the stored AI-generated insight for a specific campaign. Includes email compliance, operational flags, recommended next steps, and summary.",
      inputSchema: {
        campaignId: z.string().min(1).describe("The campaign ID"),
      },
    },
    async ({ campaignId }) => {
      const raw = await getSetting(campaignEmailInsightSettingKey(campaignId));
      const insight = parseCampaignEmailInsight(raw);

      if (!insight) {
        return {
          content: [
            {
              type: "text",
              text: `No stored insight found for campaign ${campaignId}. Run run_campaign_insights first.`,
            },
          ],
          isError: true,
        };
      }

      return {
        structuredContent: { insight },
        content: [
          {
            type: "text",
            text: `Insight for "${insight.campaignName}" (generated ${insight.generatedAt}): ${insight.operationalSummary.totalFlags} flag(s), ${insight.operationalSummary.criticalFlags} critical.`,
          },
        ],
      };
    }
  );

  return server;
}

// ── Shared helpers ─────────────────────────────────────────────────

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

const app = createMcpExpressApp({ host: HOST });

app.post("/mcp", async (req: Request, res: Response) => {
  if (!isAuthorized(req)) {
    authFailure(res);
    return;
  }

  const server = getServer();

  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

    res.on("close", () => {
      transport.close();
      server.close();
    });
  } catch (error) {
    console.error("MCP request failed:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/mcp", (_req, res) => {
  jsonRpcMethodNotAllowed(res);
});

app.delete("/mcp", (_req, res) => {
  jsonRpcMethodNotAllowed(res);
});

app.get("/healthz", (_req, res) => {
  res.status(200).json({
    ok: true,
    server: SERVER_NAME,
    version: SERVER_VERSION,
    auth: MCP_API_KEY ? "api-key" : "none",
  });
});

app.get("/", (_req, res) => {
  res.status(200).send("ok");
});

app.listen(PORT, HOST, (error?: Error) => {
  if (error) {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
  }

  if (!MCP_API_KEY) {
    console.warn("MCP_API_KEY is not set; MCP endpoint is unauthenticated.");
  }

  console.log(`${SERVER_NAME} listening on ${HOST}:${PORT}`);
});
