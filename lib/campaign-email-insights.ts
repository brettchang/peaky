import { DEFAULT_AI_CAMPAIGN_EMAIL_SUMMARY_PROMPT } from "./ai-constants";
import { ensurePrimaryMailbox } from "./email/service";
import { listNylasMessagesForThread, searchNylasThreads } from "./email/nylas";
import type { EmailNylasMessage } from "./email/types";
import type { Campaign, OnboardingRound, Placement } from "./types";

const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
const DEFAULT_WINDOW_DAYS = 14;
const DEFAULT_MAX_THREADS = 12;
const RESPONSE_SLA_MINUTES = 180;
const DEFAULT_INTERNAL_DOMAINS = ["thepeakmediaco.com"];

export interface CampaignEmailInsight {
  campaignId: string;
  campaignName: string;
  generatedAt: string;
  analyzedWindowDays: number;
  matchedThreadCount: number;
  matchedMessageCount: number;
  latestMessageAt?: string;
  latestClientMessageAt?: string;
  missingCorrespondence: boolean;
  missingCorrespondenceReason?: string;
  compliance: {
    requiredResponseHours: number;
    clientMessagesNeedingResponse: number;
    overdueResponses: number;
    worstResponseMinutes?: number;
    compliant: boolean;
  };
  highlights: string[];
  summary: string;
  operationalSummary: {
    totalPlacements: number;
    scheduledPlacements: number;
    unscheduledPlacements: number;
    placementsStartingWithin5Days: number;
    missingCopyWithin5Days: number;
    onboardingRoundsOpen: number;
    overdueOnboardingRounds: number;
    approvalsAwaitingClient: number;
    staleApprovalsAwaitingClient: number;
    totalFlags: number;
    criticalFlags: number;
  };
  flags: CampaignOpsFlag[];
  recommendedNextSteps: string[];
  summaryDebug?: {
    mode: "ai" | "fallback_no_api_key" | "fallback_no_context" | "fallback_error";
    usedCustomPrompt: boolean;
    error?: string;
    provider?: "openai";
  };
}

export interface CampaignOpsFlag {
  id: string;
  severity: "critical" | "warning";
  category: "placement" | "copy" | "onboarding" | "approval" | "email";
  title: string;
  detail: string;
  placementId?: string;
  roundId?: string;
}

interface CampaignOpsAnalysis {
  summary: CampaignEmailInsight["operationalSummary"];
  flags: CampaignOpsFlag[];
  recommendedNextSteps: string[];
}

interface CampaignOpsContext {
  hasRecentCampaignCommunication: boolean;
  suppressUnscheduledFlags: boolean;
  emailInactivityReason?: string;
}

interface CampaignMonitorInput {
  campaign: Campaign;
  clientName?: string;
  contactEmails: string[];
  summaryPrompt?: string;
}

interface ThreadSummary {
  threadId: string;
  subject: string;
  latestAt?: string;
  snippet: string;
}

const CAMPAIGN_EMAIL_INSIGHT_KEY_PREFIX = "campaign_email_insight:";

export function campaignEmailInsightSettingKey(campaignId: string): string {
  return `${CAMPAIGN_EMAIL_INSIGHT_KEY_PREFIX}${campaignId}`;
}

export function parseCampaignEmailInsight(
  value: string | null | undefined
): CampaignEmailInsight | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as CampaignEmailInsight;
    if (!parsed || typeof parsed !== "object") return undefined;
    if (!parsed.campaignId || !parsed.campaignName || !parsed.generatedAt) {
      return undefined;
    }
    return {
      ...parsed,
      operationalSummary: parsed.operationalSummary ?? {
        totalPlacements: 0,
        scheduledPlacements: 0,
        unscheduledPlacements: 0,
        placementsStartingWithin5Days: 0,
        missingCopyWithin5Days: 0,
        onboardingRoundsOpen: 0,
        overdueOnboardingRounds: 0,
        approvalsAwaitingClient: 0,
        staleApprovalsAwaitingClient: 0,
        totalFlags: 0,
        criticalFlags: 0,
      },
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
      recommendedNextSteps: Array.isArray(parsed.recommendedNextSteps)
        ? parsed.recommendedNextSteps
        : [],
    };
  } catch {
    return undefined;
  }
}

export async function buildCampaignEmailInsight(
  input: CampaignMonitorInput
): Promise<CampaignEmailInsight> {
  const campaign = input.campaign;
  const windowDays = parseNumberEnv("CAMPAIGN_EMAIL_WINDOW_DAYS", DEFAULT_WINDOW_DAYS);
  const maxThreads = parseNumberEnv("CAMPAIGN_EMAIL_MAX_THREADS", DEFAULT_MAX_THREADS);
  const queries = buildCampaignQuery({
    campaignName: campaign.name,
    clientName: input.clientName,
    contactEmails: input.contactEmails,
    windowDays,
  });
  const opsAnalysis = analyzeCampaignOperations(campaign);
  if (queries.length === 0) {
    return buildOperationalOnlyInsight(campaign, opsAnalysis, {
      analyzedWindowDays: windowDays,
      missingCorrespondence:
        campaign.status === "Active" && input.contactEmails.length > 0,
      missingCorrespondenceReason:
        input.contactEmails.length === 0
          ? "No client contact emails are saved on this campaign, so the update is based on campaign data only."
          : "No valid email queries could be built for this campaign, so the update is based on campaign data only.",
      summaryDebug: buildSummaryDebug(input.summaryPrompt),
    });
  }
  const mailbox = await ensurePrimaryMailbox();
  if (!mailbox.nylasGrantId) {
    return buildOperationalOnlyInsight(campaign, opsAnalysis, {
      analyzedWindowDays: windowDays,
      missingCorrespondence: campaign.status === "Active",
      missingCorrespondenceReason:
        "Nylas mailbox is not connected, so this update is based on campaign data only.",
      summaryDebug: buildSummaryDebug(input.summaryPrompt),
    });
  }

  const threadIds = await listThreadIds(mailbox.nylasGrantId, queries, maxThreads);
  const now = new Date();

  if (threadIds.length === 0) {
    const missingReason = campaign.status === "Active"
      ? `No matching inbox threads were found in the last ${windowDays} days for known client contacts.`
      : undefined;

    return buildOperationalOnlyInsight(campaign, opsAnalysis, {
      analyzedWindowDays: windowDays,
      missingCorrespondence: Boolean(missingReason),
      missingCorrespondenceReason: missingReason,
      summaryDebug: buildSummaryDebug(input.summaryPrompt),
    });
  }

  const internalDomains = parseInternalDomains();
  const details = await Promise.all(
    threadIds.map((threadId) => getThreadDetail(mailbox.nylasGrantId as string, threadId))
  );

  const summaries: ThreadSummary[] = [];
  const threadContexts: string[] = [];
  const clientSnippets: string[] = [];
  const teamSnippets: string[] = [];
  let matchedMessageCount = 0;
  let latestMessageAt: Date | undefined;
  let latestClientMessageAt: Date | undefined;
  let clientMessagesNeedingResponse = 0;
  let overdueResponses = 0;
  let worstResponseMinutes = 0;

  for (const thread of details) {
    const normalized = normalizeMessages(thread.messages);
    if (normalized.length === 0) continue;

    const latestThreadMessage = normalized[normalized.length - 1];
    matchedMessageCount += normalized.length;
    if (!latestMessageAt || latestThreadMessage.at > latestMessageAt) {
      latestMessageAt = latestThreadMessage.at;
    }

    const subject = latestThreadMessage.subject || "(No subject)";
    const latestSnippet = latestThreadMessage.bodyText || latestThreadMessage.snippet;
    summaries.push({
      threadId: thread.id || "unknown",
      subject,
      latestAt: latestThreadMessage.at.toISOString(),
      snippet: latestSnippet || "",
    });

    const recentThreadContext = normalized
      .slice(-4)
      .map(
        (message) =>
          `${formatShortDate(message.at.toISOString())} | ${message.fromEmail} | ${message.subject || "(No subject)"}\n${cleanSnippet(message.bodyText || message.snippet)}`
      )
      .join("\n\n");
    if (recentThreadContext) {
      threadContexts.push(`Thread: ${subject}\n${recentThreadContext}`);
    }

    for (let i = 0; i < normalized.length; i += 1) {
      const message = normalized[i];
      const knownClient = input.contactEmails.includes(message.fromEmail);
      const internal = isInternalSender(message.fromEmail, internalDomains);
      if (!knownClient && internal) continue;

      clientMessagesNeedingResponse += 1;
      if (message.snippet) {
        clientSnippets.push(cleanSnippet(message.bodyText || message.snippet));
      }
      if (!latestClientMessageAt || message.at > latestClientMessageAt) {
        latestClientMessageAt = message.at;
      }

      const response = normalized.slice(i + 1).find((candidate) =>
        isInternalSender(candidate.fromEmail, internalDomains)
      );
      if (response?.snippet) {
        teamSnippets.push(cleanSnippet(response.bodyText || response.snippet));
      }
      const responseMinutes = response
        ? Math.floor((response.at.getTime() - message.at.getTime()) / 60000)
        : Math.floor((now.getTime() - message.at.getTime()) / 60000);

      if (responseMinutes > worstResponseMinutes) {
        worstResponseMinutes = responseMinutes;
      }
      if (responseMinutes > RESPONSE_SLA_MINUTES) {
        overdueResponses += 1;
      }
    }
  }

  const sortedSummaries = summaries
    .sort((a, b) => (b.latestAt || "").localeCompare(a.latestAt || ""))
    .slice(0, 3);

  const latestMessageAtMs = latestMessageAt?.getTime();
  const missingCorrespondence =
    campaign.status === "Active" &&
    typeof latestMessageAtMs === "number" &&
    now.getTime() - latestMessageAtMs > 5 * 24 * 60 * 60 * 1000;

  const missingCorrespondenceReason = missingCorrespondence
    ? "No campaign-correlated inbox activity has been seen in the last 5 days while campaign is Active."
    : undefined;

  const highlights = sortedSummaries.length > 0
    ? sortedSummaries.map(
        (row) =>
          `${row.subject}${row.latestAt ? ` (${formatShortDate(row.latestAt)})` : ""}${row.snippet ? `: ${cleanSnippet(row.snippet)}` : ""}`
      )
    : ["No thread highlights available."];

  const opsContext = buildOpsContext({
    latestClientMessageAt,
    latestMessageAt,
    now,
    missingCorrespondenceReason,
  });
  const contextualOpsAnalysis = applyEmailContextToOpsAnalysis(
    opsAnalysis,
    opsContext
  );

  const summaryResult = await buildConversationSummary({
    campaignName: campaign.name,
    clientName: input.clientName,
    campaignStatus: campaign.status,
    managerNotes: campaign.latestCampaignManagerNote?.body,
    threadCount: threadIds.length,
    messageCount: matchedMessageCount,
    overdueResponses,
    requiredResponseHours: RESPONSE_SLA_MINUTES / 60,
    promptTemplate: input.summaryPrompt,
    threadContexts,
    clientSnippets,
    teamSnippets,
    threadSummaries: sortedSummaries,
    operationalSummary: contextualOpsAnalysis.summary,
    flags: contextualOpsAnalysis.flags,
    recommendedNextSteps: contextualOpsAnalysis.recommendedNextSteps,
  });

  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    generatedAt: now.toISOString(),
    analyzedWindowDays: windowDays,
    matchedThreadCount: threadIds.length,
    matchedMessageCount,
    latestMessageAt: latestMessageAt?.toISOString(),
    latestClientMessageAt: latestClientMessageAt?.toISOString(),
    missingCorrespondence,
    missingCorrespondenceReason,
    compliance: {
      requiredResponseHours: RESPONSE_SLA_MINUTES / 60,
      clientMessagesNeedingResponse,
      overdueResponses,
      worstResponseMinutes: worstResponseMinutes || undefined,
      compliant: overdueResponses === 0,
    },
    highlights,
    summary: summaryResult.text,
    operationalSummary: contextualOpsAnalysis.summary,
    flags: contextualOpsAnalysis.flags,
    recommendedNextSteps: contextualOpsAnalysis.recommendedNextSteps,
    summaryDebug: {
      mode: summaryResult.mode,
      usedCustomPrompt: Boolean(input.summaryPrompt?.trim()),
      error: summaryResult.error,
      provider: summaryResult.provider,
    },
  };
}

async function listThreadIds(
  grantId: string,
  queries: string[],
  maxResults: number
): Promise<string[]> {
  const ids = new Set<string>();
  for (const query of queries) {
    if (ids.size >= maxResults) break;
    const threads = await searchNylasThreads({
      grantId,
      searchQueryNative: query,
      limit: maxResults,
    });
    for (const thread of threads) {
      const id = thread.id?.trim() || "";
      if (id) ids.add(id);
      if (ids.size >= maxResults) break;
    }
  }

  return Array.from(ids).slice(0, maxResults);
}

async function getThreadDetail(
  grantId: string,
  threadId: string
): Promise<{ id: string; messages: EmailNylasMessage[] }> {
  const messages = await listNylasMessagesForThread(grantId, threadId);
  return { id: threadId, messages };
}

function normalizeMessages(messages: EmailNylasMessage[]): Array<{
  at: Date;
  fromEmail: string;
  subject: string;
  snippet: string;
  bodyText: string;
}> {
  const normalized = messages
    .map((message) => {
      const at = resolveMessageDate(message);
      const fromEmail = message.from?.[0]?.email?.trim().toLowerCase() || "";
      const bodyText = message.body?.trim() || "";
      if (!fromEmail || !at) return null;
      return {
        at,
        fromEmail,
        subject: message.subject?.trim() ?? "",
        snippet: message.snippet?.trim() ?? "",
        bodyText,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  return normalized.sort((a, b) => a.at.getTime() - b.at.getTime());
}

function resolveMessageDate(message: EmailNylasMessage): Date | null {
  if (typeof message.date !== "number") return null;
  const millis = message.date > 1_000_000_000_000 ? message.date : message.date * 1000;
  const parsed = new Date(millis);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isInternalSender(email: string, internalDomains: string[]): boolean {
  const parts = email.split("@");
  if (parts.length !== 2) return false;
  return internalDomains.includes(parts[1].toLowerCase());
}

function parseInternalDomains(): string[] {
  const raw = process.env.CAMPAIGN_EMAIL_INTERNAL_DOMAINS?.trim();
  if (!raw) return DEFAULT_INTERNAL_DOMAINS;
  const domains = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return domains.length > 0 ? domains : DEFAULT_INTERNAL_DOMAINS;
}

function buildCampaignQuery(input: {
  campaignName: string;
  clientName?: string;
  contactEmails: string[];
  windowDays: number;
}): string[] {
  const emailClause = input.contactEmails
    .map((email) => `(from:${email} OR to:${email} OR cc:${email})`)
    .join(" OR ");
  const escapedCampaignName = input.campaignName.replace(/"/g, "");
  const escapedClientName = (input.clientName ?? "").replace(/"/g, "");
  const tokenizedCampaign = escapedCampaignName
    .split(/\s+/)
    .map((token) => token.replace(/[^a-zA-Z0-9_-]/g, "").trim())
    .filter((token) => token.length >= 4)
    .slice(0, 4);

  const queries: string[] = [];
  if (escapedCampaignName) {
    queries.push(
      `newer_than:${input.windowDays}d (${emailClause}) "${escapedCampaignName}"`
    );
  }
  if (escapedClientName) {
    queries.push(
      `newer_than:${input.windowDays}d (${emailClause}) "${escapedClientName}"`
    );
  }
  if (tokenizedCampaign.length > 0) {
    queries.push(
      `newer_than:${input.windowDays}d (${emailClause}) (${tokenizedCampaign.join(" OR ")})`
    );
  }
  queries.push(`newer_than:${input.windowDays}d (${emailClause})`);
  return Array.from(new Set(queries.filter(Boolean)));
}

function parseNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function buildSummaryDebug(summaryPrompt?: string): CampaignEmailInsight["summaryDebug"] {
  return {
    mode: process.env.OPENAI_API_KEY?.trim() ? "ai" : "fallback_no_api_key",
    usedCustomPrompt: Boolean(summaryPrompt?.trim()),
    provider: process.env.OPENAI_API_KEY?.trim() ? "openai" : undefined,
  };
}

function formatShortDate(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return iso;
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function cleanSnippet(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim()
    .slice(0, 180);
}

async function buildConversationSummary(input: {
  campaignName: string;
  clientName?: string;
  campaignStatus: string;
  managerNotes?: string;
  threadCount: number;
  messageCount: number;
  overdueResponses: number;
  requiredResponseHours: number;
  promptTemplate?: string;
  threadContexts: string[];
  clientSnippets: string[];
  teamSnippets: string[];
  threadSummaries: ThreadSummary[];
  operationalSummary: CampaignEmailInsight["operationalSummary"];
  flags: CampaignOpsFlag[];
  recommendedNextSteps: string[];
}): Promise<{
  text: string;
  mode: "ai" | "fallback_no_api_key" | "fallback_no_context" | "fallback_error";
  error?: string;
  provider?: "openai";
}> {
  const fallback = buildFallbackCampaignSummary(input);
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return { text: fallback, mode: "fallback_no_api_key" };
  }
  if (input.threadContexts.length === 0 && input.flags.length === 0) {
    return { text: fallback, mode: "fallback_no_context" };
  }

  try {
    const promptTemplate =
      input.promptTemplate?.trim() || DEFAULT_AI_CAMPAIGN_EMAIL_SUMMARY_PROMPT;
    const systemPrompt = applyTemplateVariables(promptTemplate, {
      campaignName: input.campaignName,
      clientName: input.clientName || "Unknown Client",
      campaignStatus: input.campaignStatus,
      requiredResponseHours: String(input.requiredResponseHours),
    });

    const userMessage = `Campaign: ${input.campaignName}
Client: ${input.clientName || "Unknown Client"}
Status: ${input.campaignStatus}
Threads reviewed: ${input.threadCount}
Messages reviewed: ${input.messageCount}
Overdue responses (>3h): ${input.overdueResponses}

Campaign manager notes:
${input.managerNotes?.trim() || "None provided."}

Recent thread context:
${input.threadContexts.slice(0, 5).join("\n\n")}

Operational campaign status:
- Placements: ${input.operationalSummary.scheduledPlacements}/${input.operationalSummary.totalPlacements} scheduled
- Unscheduled placements: ${input.operationalSummary.unscheduledPlacements}
- Starting within 5 days without copy: ${input.operationalSummary.missingCopyWithin5Days}
- Open onboarding rounds: ${input.operationalSummary.onboardingRoundsOpen}
- Overdue onboarding rounds (5+ days): ${input.operationalSummary.overdueOnboardingRounds}
- Waiting on client approval: ${input.operationalSummary.approvalsAwaitingClient}
- Waiting on client approval for 5+ days: ${input.operationalSummary.staleApprovalsAwaitingClient}

Key operational flags:
${input.flags.slice(0, 10).map((flag) => `- [${flag.severity}] ${flag.title}: ${flag.detail}`).join("\n")}

Recommended next steps:
${input.recommendedNextSteps.map((step) => `- ${step}`).join("\n")}

Use campaign manager notes as operational context that may explain a flag, but do not dismiss unresolved risks unless the note clearly addresses them.
`;

    const result = await createSummaryWithModelFallback({
      systemPrompt,
      userMessage,
    });
    return {
      text: result.text || fallback,
      mode: result.text ? "ai" : "fallback_error",
      provider: result.provider,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      text: fallback,
      mode: "fallback_error",
      error: message.slice(0, 300),
    };
  }
}

async function createSummaryWithModelFallback(input: {
  systemPrompt: string;
  userMessage: string;
}) {
  const errors: string[] = [];

  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  if (openAiKey) {
    try {
      const text = await createSummaryWithOpenAi({
        apiKey: openAiKey,
        systemPrompt: input.systemPrompt,
        userMessage: input.userMessage,
      });
      if (text) return { text, provider: "openai" as const };
      errors.push("OpenAI returned empty text.");
    } catch (error) {
      errors.push(`OpenAI failed: ${stringifyError(error)}`);
    }
  } else {
    errors.push("OpenAI API key unavailable.");
  }

  throw new Error(errors.join(" | "));
}

async function createSummaryWithOpenAi(input: {
  apiKey: string;
  systemPrompt: string;
  userMessage: string;
}): Promise<string> {
  const model =
    process.env.CAMPAIGN_EMAIL_OPENAI_MODEL?.trim() ||
    process.env.CAMPAIGN_EMAIL_OPENAI_FALLBACK_MODEL?.trim() ||
    DEFAULT_OPENAI_MODEL;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: input.userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status}: ${body.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = payload.choices?.[0]?.message?.content?.trim() ?? "";
  return text;
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildFallbackConversationSummary(input: {
  campaignName?: string;
  campaignStatus?: string;
  managerNotes?: string;
  threadCount: number;
  messageCount: number;
  overdueResponses: number;
  threadContexts: string[];
  clientSnippets: string[];
  teamSnippets: string[];
  operationalSummary: CampaignEmailInsight["operationalSummary"];
  flags: CampaignOpsFlag[];
  recommendedNextSteps: string[];
}): string {
  const clientKey = input.clientSnippets.find(Boolean);
  const teamKey = input.teamSnippets.find(Boolean);
  const topFlags = input.flags.slice(0, 3).map((flag) => `${flag.title}: ${flag.detail}`);

  const slaLine =
    input.overdueResponses === 0
      ? "Response SLA is currently within the 3-hour standard."
      : `${input.overdueResponses} client message${input.overdueResponses === 1 ? "" : "s"} exceeded the 3-hour response SLA.`;

  const convoLine =
    clientKey
      ? `Recent client message trend: "${clientKey}".`
      : "No client message excerpt was available to summarize.";

  const teamLine = teamKey
    ? `Latest team response context: "${teamKey}".`
    : "";
  const managerNotesLine = input.managerNotes?.trim()
    ? `Campaign manager context: ${truncateForSummary(input.managerNotes)}.`
    : "";

  const opsLine = `Placements scheduled: ${input.operationalSummary.scheduledPlacements}/${input.operationalSummary.totalPlacements}. ${input.operationalSummary.unscheduledPlacements} unscheduled, ${input.operationalSummary.missingCopyWithin5Days} starting within 5 days without copy, ${input.operationalSummary.staleApprovalsAwaitingClient} waiting on client approval for 5+ days, and ${input.operationalSummary.overdueOnboardingRounds} onboarding form${input.operationalSummary.overdueOnboardingRounds === 1 ? "" : "s"} overdue 5+ days.`;

  const flagLine = topFlags.length > 0
    ? `Top risks: ${topFlags.join(" | ")}.`
    : "No operational blockers were flagged.";

  const nextStepsLine = input.recommendedNextSteps.length > 0
    ? `Next steps: ${input.recommendedNextSteps.slice(0, 3).join(" ")}`
    : "No immediate next steps were generated.";

  return `Reviewed ${input.threadCount} thread${input.threadCount === 1 ? "" : "s"} (${input.messageCount} messages). ${opsLine} ${convoLine} ${teamLine} ${managerNotesLine} ${slaLine} ${flagLine} ${nextStepsLine}`.trim();
}

function truncateForSummary(value: string, maxLength = 220): string {
  const normalized = cleanSnippet(value);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}

function applyTemplateVariables(
  prompt: string,
  vars: Record<string, string>
): string {
  return prompt.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match);
}

function buildFallbackCampaignSummary(input: Parameters<typeof buildFallbackConversationSummary>[0]): string {
  return buildFallbackConversationSummary(input);
}

export function buildCampaignOperationalInsight(
  campaign: Campaign,
  baseInsight?: CampaignEmailInsight
): CampaignEmailInsight {
  const opsAnalysis = applyEmailContextToOpsAnalysis(
    analyzeCampaignOperations(campaign),
    buildOpsContext({
      latestClientMessageAt: baseInsight?.latestClientMessageAt
        ? new Date(baseInsight.latestClientMessageAt)
        : undefined,
      latestMessageAt: baseInsight?.latestMessageAt
        ? new Date(baseInsight.latestMessageAt)
        : undefined,
      now: new Date(),
      missingCorrespondenceReason: baseInsight?.missingCorrespondenceReason,
    })
  );
  const summary = buildFallbackCampaignSummary({
    campaignName: campaign.name,
    campaignStatus: campaign.status,
    managerNotes: campaign.latestCampaignManagerNote?.body,
    threadCount: baseInsight?.matchedThreadCount ?? 0,
    messageCount: baseInsight?.matchedMessageCount ?? 0,
    overdueResponses: baseInsight?.compliance.overdueResponses ?? 0,
    threadContexts: [],
    clientSnippets: [],
    teamSnippets: [],
    operationalSummary: opsAnalysis.summary,
    flags: opsAnalysis.flags,
    recommendedNextSteps: opsAnalysis.recommendedNextSteps,
  });

  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    generatedAt: baseInsight?.generatedAt ?? new Date().toISOString(),
    analyzedWindowDays: baseInsight?.analyzedWindowDays ?? DEFAULT_WINDOW_DAYS,
    matchedThreadCount: baseInsight?.matchedThreadCount ?? 0,
    matchedMessageCount: baseInsight?.matchedMessageCount ?? 0,
    latestMessageAt: baseInsight?.latestMessageAt,
    latestClientMessageAt: baseInsight?.latestClientMessageAt,
    missingCorrespondence: baseInsight?.missingCorrespondence ?? false,
    missingCorrespondenceReason: baseInsight?.missingCorrespondenceReason,
    compliance: baseInsight?.compliance ?? {
      requiredResponseHours: RESPONSE_SLA_MINUTES / 60,
      clientMessagesNeedingResponse: 0,
      overdueResponses: 0,
      compliant: true,
    },
    highlights:
      baseInsight?.highlights && baseInsight.highlights.length > 0
        ? baseInsight.highlights
        : ["Campaign update is based on placement and onboarding data."],
    summary,
    operationalSummary: opsAnalysis.summary,
    flags: opsAnalysis.flags,
    recommendedNextSteps: opsAnalysis.recommendedNextSteps,
    summaryDebug: baseInsight?.summaryDebug ?? {
      mode: "fallback_no_context",
      usedCustomPrompt: false,
    },
  };
}

function analyzeCampaignOperations(campaign: Campaign): {
  summary: CampaignEmailInsight["operationalSummary"];
  flags: CampaignOpsFlag[];
  recommendedNextSteps: string[];
} {
  const now = new Date();
  const flags: CampaignOpsFlag[] = [];

  const unscheduledPlacements = campaign.placements.filter((placement) => !placement.scheduledDate);
  for (const placement of unscheduledPlacements) {
    flags.push({
      id: `placement-unscheduled:${placement.id}`,
      severity: "critical",
      category: "placement",
      title: `${placement.name} is unscheduled`,
      detail: `${placement.type} has no scheduled run date yet.`,
      placementId: placement.id,
    });
  }

  const placementsStartingWithin5Days = campaign.placements.filter((placement) =>
    isWithinNextDays(placement.scheduledDate, 5, now)
  );
  const missingCopyWithin5Days = placementsStartingWithin5Days.filter(
    (placement) => !placement.currentCopy.trim()
  );
  for (const placement of missingCopyWithin5Days) {
    flags.push({
      id: `copy-missing:${placement.id}`,
      severity: "critical",
      category: "copy",
      title: `${placement.name} is running soon without copy`,
      detail: `${placement.type} is scheduled for ${placement.scheduledDate} and still has no saved copy.`,
      placementId: placement.id,
    });
  }

  const openOnboardingRounds = campaign.onboardingRounds.filter((round) => !round.complete);
  const overdueOnboardingRounds = openOnboardingRounds.filter((round) =>
    isDateAtLeastDaysAgo(round.createdAt, 5, now)
  );
  for (const round of overdueOnboardingRounds) {
    const roundPlacements = getPlacementsForRound(campaign.placements, round);
    flags.push({
      id: `onboarding-overdue:${round.id}`,
      severity: "warning",
      category: "onboarding",
      title: `${round.label ?? "Onboarding form"} has been open for 5+ days`,
      detail: `${roundPlacements.length} placement${roundPlacements.length === 1 ? "" : "s"} are attached and the form is still incomplete.`,
      roundId: round.id,
    });
  }

  const approvalsAwaitingClient = campaign.placements.filter((placement) =>
    isAwaitingClientApproval(placement)
  );
  const staleApprovalsAwaitingClient = approvalsAwaitingClient.filter((placement) =>
    isPlacementApprovalStale(placement, now)
  );
  for (const placement of staleApprovalsAwaitingClient) {
    flags.push({
      id: `approval-stale:${placement.id}`,
      severity: "warning",
      category: "approval",
      title: `${placement.name} is still waiting on client approval`,
      detail: `${placement.type} has been in client review for 5+ days based on the latest copy update.`,
      placementId: placement.id,
    });
  }

  const recommendedNextSteps = buildRecommendedNextSteps({
    unscheduledPlacements,
    missingCopyWithin5Days,
    overdueOnboardingRounds,
    staleApprovalsAwaitingClient,
    approvalsAwaitingClient,
  });

  return {
    summary: {
      totalPlacements: campaign.placements.length,
      scheduledPlacements: campaign.placements.length - unscheduledPlacements.length,
      unscheduledPlacements: unscheduledPlacements.length,
      placementsStartingWithin5Days: placementsStartingWithin5Days.length,
      missingCopyWithin5Days: missingCopyWithin5Days.length,
      onboardingRoundsOpen: openOnboardingRounds.length,
      overdueOnboardingRounds: overdueOnboardingRounds.length,
      approvalsAwaitingClient: approvalsAwaitingClient.length,
      staleApprovalsAwaitingClient: staleApprovalsAwaitingClient.length,
      totalFlags: flags.length,
      criticalFlags: flags.filter((flag) => flag.severity === "critical").length,
    },
    flags,
    recommendedNextSteps,
  };
}

function buildOperationalOnlyInsight(
  campaign: Campaign,
  opsAnalysis: CampaignOpsAnalysis,
  input: {
    analyzedWindowDays: number;
    missingCorrespondence: boolean;
    missingCorrespondenceReason?: string;
    summaryDebug?: CampaignEmailInsight["summaryDebug"];
  }
): CampaignEmailInsight {
  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    generatedAt: new Date().toISOString(),
    analyzedWindowDays: input.analyzedWindowDays,
    matchedThreadCount: 0,
    matchedMessageCount: 0,
    missingCorrespondence: input.missingCorrespondence,
    missingCorrespondenceReason: input.missingCorrespondenceReason,
    compliance: {
      requiredResponseHours: RESPONSE_SLA_MINUTES / 60,
      clientMessagesNeedingResponse: 0,
      overdueResponses: 0,
      compliant: true,
    },
    highlights: ["Campaign update is based on placement and onboarding data."],
    summary: buildFallbackCampaignSummary({
      campaignName: campaign.name,
      campaignStatus: campaign.status,
      managerNotes: campaign.latestCampaignManagerNote?.body,
      threadCount: 0,
      messageCount: 0,
      overdueResponses: 0,
      threadContexts: [],
      clientSnippets: [],
      teamSnippets: [],
      operationalSummary: opsAnalysis.summary,
      flags: opsAnalysis.flags,
      recommendedNextSteps: opsAnalysis.recommendedNextSteps,
    }),
    operationalSummary: opsAnalysis.summary,
    flags: opsAnalysis.flags,
    recommendedNextSteps: opsAnalysis.recommendedNextSteps,
    summaryDebug: input.summaryDebug,
  };
}

function applyEmailContextToOpsAnalysis(
  opsAnalysis: CampaignOpsAnalysis,
  context: CampaignOpsContext
): CampaignOpsAnalysis {
  let flags = opsAnalysis.flags.map((flag) => {
    if (
      flag.category === "placement" &&
      flag.id.startsWith("placement-unscheduled:") &&
      !context.hasRecentCampaignCommunication
    ) {
      return {
        ...flag,
        detail: `${flag.detail} This is being flagged because no campaign-correlated client email has been seen in the last 5 days.`,
      };
    }
    return flag;
  });
  let recommendedNextSteps = [...opsAnalysis.recommendedNextSteps];

  if (context.suppressUnscheduledFlags) {
    flags = flags.filter(
      (flag) => !(flag.category === "placement" && flag.id.startsWith("placement-unscheduled:"))
    );
    recommendedNextSteps = recommendedNextSteps.filter(
      (step) => !step.startsWith("Schedule ")
    );
  }

  if (!context.hasRecentCampaignCommunication) {
    flags.unshift({
      id: "email-inactive:campaign",
      severity: "warning",
      category: "email",
      title: "No campaign email contact in the last 5 days",
      detail:
        context.emailInactivityReason ??
        "No campaign-correlated email activity has been seen in the last 5 days. Something may be blocked, clarification may be needed from the campaign manager, or campaign contacts may need to be updated.",
    });
    recommendedNextSteps = [
      "Check why there has been no campaign-correlated client email in the last 5 days and confirm the right client contacts are on the campaign.",
      ...recommendedNextSteps,
    ];
  }

  return {
    summary: {
      ...opsAnalysis.summary,
      totalFlags: flags.length,
      criticalFlags: flags.filter((flag) => flag.severity === "critical").length,
    },
    flags,
    recommendedNextSteps,
  };
}

function buildOpsContext(input: {
  latestClientMessageAt?: Date;
  latestMessageAt?: Date;
  now: Date;
  missingCorrespondenceReason?: string;
}): CampaignOpsContext {
  const hasRecentCommunication = hasRecentCampaignCommunication(
    input.latestClientMessageAt,
    input.latestMessageAt,
    input.now
  );
  return {
    hasRecentCampaignCommunication: hasRecentCommunication,
    suppressUnscheduledFlags: hasRecentCommunication,
    emailInactivityReason: hasRecentCommunication
      ? undefined
      : input.missingCorrespondenceReason ||
        "No campaign-correlated email activity has been seen in the last 5 days. Something may be blocked, clarification may be needed from the campaign manager, or campaign contacts may need to be updated.",
  };
}

function buildRecommendedNextSteps(input: {
  unscheduledPlacements: Placement[];
  missingCopyWithin5Days: Placement[];
  overdueOnboardingRounds: OnboardingRound[];
  staleApprovalsAwaitingClient: Placement[];
  approvalsAwaitingClient: Placement[];
}): string[] {
  const steps: string[] = [];

  if (input.unscheduledPlacements.length > 0) {
    steps.push(
      `Schedule ${input.unscheduledPlacements.length} unscheduled placement${input.unscheduledPlacements.length === 1 ? "" : "s"} so campaign delivery is locked in.`
    );
  }
  if (input.missingCopyWithin5Days.length > 0) {
    steps.push(
      `Escalate copy production for ${input.missingCopyWithin5Days.length} placement${input.missingCopyWithin5Days.length === 1 ? "" : "s"} running within 5 days without copy.`
    );
  }
  if (input.overdueOnboardingRounds.length > 0) {
    steps.push(
      `Follow up on ${input.overdueOnboardingRounds.length} onboarding form${input.overdueOnboardingRounds.length === 1 ? "" : "s"} that have been open for 5+ days.`
    );
  }
  if (input.staleApprovalsAwaitingClient.length > 0) {
    steps.push(
      `Nudge the client on ${input.staleApprovalsAwaitingClient.length} stale approval${input.staleApprovalsAwaitingClient.length === 1 ? "" : "s"} that have been sitting for 5+ days.`
    );
  } else if (input.approvalsAwaitingClient.length > 0) {
    steps.push(
      `Monitor ${input.approvalsAwaitingClient.length} placement${input.approvalsAwaitingClient.length === 1 ? "" : "s"} currently in client review and confirm approvals land before run dates.`
    );
  }
  if (steps.length === 0) {
    steps.push("No immediate campaign-delivery blockers are flagged. Monitor email correspondence and upcoming run dates.");
  }

  return steps;
}

function hasRecentCampaignCommunication(
  latestClientMessageAt: Date | undefined,
  latestMessageAt: Date | undefined,
  now: Date
): boolean {
  return isRecentDate(latestClientMessageAt, now, 5) || isRecentDate(latestMessageAt, now, 5);
}

function isWithinNextDays(value: string | undefined, days: number, now: Date): boolean {
  if (!value) return false;
  const target = parseDateOnly(value);
  if (!target) return false;
  const start = startOfDay(now).getTime();
  const end = start + days * 24 * 60 * 60 * 1000;
  const targetTime = target.getTime();
  return targetTime >= start && targetTime <= end;
}

function isDateAtLeastDaysAgo(value: string | undefined, days: number, now: Date): boolean {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return now.getTime() - date.getTime() >= days * 24 * 60 * 60 * 1000;
}

function isRecentDate(value: Date | undefined, now: Date, days: number): boolean {
  if (!value || Number.isNaN(value.getTime())) return false;
  return now.getTime() - value.getTime() <= days * 24 * 60 * 60 * 1000;
}

function isAwaitingClientApproval(placement: Placement): boolean {
  return (
    placement.status === "Peak Team Review Complete" ||
    placement.status === "Sent for Approval" ||
    placement.status === "Script Review by Client" ||
    placement.status === "Audio Sent for Approval" ||
    placement.status === "Audio Sent" ||
    placement.status === "Questions In Review" ||
    placement.status === "Client Reviewing Interview"
  );
}

function isPlacementApprovalStale(placement: Placement, now: Date): boolean {
  const anchor = getLatestPlacementCopyTimestamp(placement);
  if (!anchor) return false;
  return now.getTime() - anchor.getTime() >= 5 * 24 * 60 * 60 * 1000;
}

function getLatestPlacementCopyTimestamp(placement: Placement): Date | undefined {
  const candidates = [
    placement.revisionHistory[placement.revisionHistory.length - 1]?.createdAt,
    placement.createdAt,
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return undefined;
}

function getPlacementsForRound(placements: Placement[], round: OnboardingRound): Placement[] {
  return placements.filter((placement) => placement.onboardingRoundId === round.id);
}

function parseDateOnly(value: string): Date | undefined {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
