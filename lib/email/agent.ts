import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_EMAIL_AGENT_MODEL, DEFAULT_EMAIL_AGENT_POLICY_PROMPT } from "./constants";
import {
  getCampaignContextTools,
  getCampaignSummaryForThread,
  getEmailPolicyPrompt,
  getMailboxByEmail,
  getRecentClientHistory,
} from "./db";
import { loadEmailKnowledgeBase } from "./knowledge";
import type {
  EmailAgentContext,
  EmailAgentDraftResult,
  EmailAgentToolResult,
  EmailCampaignSummary,
  EmailMailboxRecord,
  EmailThreadRecord,
  EmailToolbox,
} from "./types";

const anthropic = new Anthropic();
const PROMPT_VERSION = "peak-portal-email-v1";

export function toTextThread(thread: EmailThreadRecord): string {
  return thread.messages
    .map((message) => {
      const sentAt = message.sentAt || "unknown";
      return [
        `From: ${message.fromName || message.fromEmail || "Unknown"}`,
        `To: ${message.toRecipients.map((recipient) => recipient.email).join(", ")}`,
        message.ccRecipients.length > 0
          ? `Cc: ${message.ccRecipients.map((recipient) => recipient.email).join(", ")}`
          : undefined,
        `Date: ${sentAt}`,
        `Subject: ${message.subject}`,
        "",
        message.bodyText || message.snippet || "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n---\n\n");
}

export function buildToolbox(context: EmailAgentContext): EmailToolbox {
  return {
    findCampaignsByParticipant: async (email) => {
      const history = await getRecentClientHistory(email);
      const seenCampaigns = new Set<string>();
      const summaries = [];
      for (const thread of history) {
        for (const link of thread.links) {
          if (seenCampaigns.has(link.campaignId)) continue;
          seenCampaigns.add(link.campaignId);
          const linked = context.linkedCampaigns.find((campaign) => campaign.campaign.id === link.campaignId);
          if (linked) summaries.push(linked);
        }
      }
      return summaries;
    },
    getCampaignSummary: async (campaignId) => {
      const summary = context.linkedCampaigns.find((campaign) => campaign.campaign.id === campaignId);
      return summary ?? null;
    },
    getPortalUrls: async (campaignId) => {
      const summary = context.linkedCampaigns.find((campaign) => campaign.campaign.id === campaignId);
      if (!summary) return null;
      return { portalUrl: summary.portalUrl, billingPortalUrl: summary.billingPortalUrl };
    },
    getOnboardingStatusAndLinks: async (campaignId) => {
      const details = await getCampaignContextTools(campaignId);
      return details.onboarding;
    },
    getBillingOnboardingStatus: async (campaignId) => {
      const details = await getCampaignContextTools(campaignId);
      return details.billing;
    },
    getScheduleCapacity: async (startDate, endDate) => {
      const { getCapacitySnapshot } = await import("./db");
      return getCapacitySnapshot(startDate, endDate);
    },
    getPlacementStats: async (campaignId) => {
      const details = await getCampaignContextTools(campaignId);
      return details.placementStats;
    },
    getRecentClientHistory: async (email) => {
      return getRecentClientHistory(email);
    },
  };
}

export function buildTools(): Anthropic.Tool[] {
  return [
    {
      name: "get_campaign_summary",
      description: "Get structured campaign context for a linked Peak campaign.",
      input_schema: {
        type: "object",
        properties: {
          campaign_id: { type: "string" },
        },
        required: ["campaign_id"],
      },
    },
    {
      name: "get_portal_urls",
      description: "Get the main campaign portal URL and billing onboarding URL when available.",
      input_schema: {
        type: "object",
        properties: {
          campaign_id: { type: "string" },
        },
        required: ["campaign_id"],
      },
    },
    {
      name: "get_onboarding_status_and_links",
      description: "Get campaign onboarding completion status and active links.",
      input_schema: {
        type: "object",
        properties: {
          campaign_id: { type: "string" },
        },
        required: ["campaign_id"],
      },
    },
    {
      name: "get_billing_onboarding_status",
      description: "Get billing onboarding completion status and available billing links.",
      input_schema: {
        type: "object",
        properties: {
          campaign_id: { type: "string" },
        },
        required: ["campaign_id"],
      },
    },
    {
      name: "get_schedule_capacity",
      description: "Check available placement capacity for a date range.",
      input_schema: {
        type: "object",
        properties: {
          start_date: { type: "string" },
          end_date: { type: "string" },
        },
        required: ["start_date", "end_date"],
      },
    },
    {
      name: "get_placement_stats",
      description: "Get latest placement-level campaign performance stats.",
      input_schema: {
        type: "object",
        properties: {
          campaign_id: { type: "string" },
        },
        required: ["campaign_id"],
      },
    },
  ];
}

export async function executeTool(
  toolbox: EmailToolbox,
  name: string,
  input: Record<string, unknown>
): Promise<EmailAgentToolResult> {
  switch (name) {
    case "get_campaign_summary":
      return {
        name,
        input,
        output: (await toolbox.getCampaignSummary(String(input.campaign_id))) ?? "Campaign not found",
      };
    case "get_portal_urls":
      return {
        name,
        input,
        output: (await toolbox.getPortalUrls(String(input.campaign_id))) ?? "Portal URLs unavailable",
      };
    case "get_onboarding_status_and_links":
      return {
        name,
        input,
        output: await toolbox.getOnboardingStatusAndLinks(String(input.campaign_id)),
      };
    case "get_billing_onboarding_status":
      return {
        name,
        input,
        output: await toolbox.getBillingOnboardingStatus(String(input.campaign_id)),
      };
    case "get_schedule_capacity":
      return {
        name,
        input,
        output: await toolbox.getScheduleCapacity(
          String(input.start_date),
          String(input.end_date)
        ),
      };
    case "get_placement_stats":
      return {
        name,
        input,
        output: await toolbox.getPlacementStats(String(input.campaign_id)),
      };
    default:
      return {
        name,
        input,
        output: "Unsupported tool call",
      };
  }
}

export function parseDraftResult(text: string): EmailAgentDraftResult {
  const rawJson = text.match(/\{[\s\S]*"subject"[\s\S]*"bodyHtml"[\s\S]*\}/)?.[0] || text;
  const parsed = JSON.parse(rawJson) as Record<string, unknown>;
  return {
    subject: String(parsed.subject || "Re: Your email"),
    bodyHtml: String(parsed.bodyHtml || "<p>Thank you for your email.</p>"),
    bodyText: String(parsed.bodyText || "Thank you for your email."),
    explanationSummary: String(parsed.explanationSummary || "Draft based on linked campaign data."),
    explanation: String(parsed.explanation || parsed.explanationSummary || ""),
    confidence: Number(parsed.confidence || 50),
    missingDataFlags: Array.isArray(parsed.missingDataFlags)
      ? parsed.missingDataFlags.map(String)
      : [],
    safetyFlags: Array.isArray(parsed.safetyFlags) ? parsed.safetyFlags.map(String) : [],
    toolCalls: [],
    steps: Array.isArray(parsed.steps)
      ? parsed.steps.map((step) => ({
          stepType: String((step as Record<string, unknown>).stepType || "reasoning"),
          title: String((step as Record<string, unknown>).title || "Reasoning"),
          content:
            typeof (step as Record<string, unknown>).content === "string"
              ? String((step as Record<string, unknown>).content)
              : undefined,
          citations: Array.isArray((step as Record<string, unknown>).citations)
            ? ((step as Record<string, unknown>).citations as unknown[]).map(String)
            : [],
          payload:
            typeof (step as Record<string, unknown>).payload === "object"
              ? ((step as Record<string, unknown>).payload as Record<string, unknown>)
              : undefined,
        }))
      : [],
    rawResponse: parsed,
  };
}

export async function buildEmailAgentContext(thread: EmailThreadRecord): Promise<EmailAgentContext> {
  const [knowledgeBase, policyPrompt, linkedCampaigns] = await Promise.all([
    loadEmailKnowledgeBase(),
    getEmailPolicyPrompt(),
    getCampaignSummaryForThread(thread.id),
  ]);
  const resolvedMailbox = await getMailboxByEmail("adops@thepeakmediaco.com");
  if (!resolvedMailbox) {
    throw new Error("Mailbox connection has not been initialized.");
  }
  return {
    mailbox: resolvedMailbox,
    thread,
    linkedCampaigns,
    policyPrompt,
    knowledgeBase,
  };
}

export async function generateEmailDraftFromContext(context: EmailAgentContext): Promise<{
  result: EmailAgentDraftResult;
  context: EmailAgentContext;
}> {
  const toolbox = buildToolbox(context);
  const tools = buildTools();
  const systemPrompt = `${context.policyPrompt || DEFAULT_EMAIL_AGENT_POLICY_PROMPT}

Prompt version: ${PROMPT_VERSION}

Knowledge Base:
${context.knowledgeBase.markdown}

Linked Campaigns — USE THIS DATA. These campaigns are matched to this email thread. Always use the portal URLs and campaign details provided here. If the client asks about their portal, link, campaign status, or anything related, use these URLs directly. Do not say you'll "get back to them" if the data is right here.
${JSON.stringify(
    context.linkedCampaigns.map((campaign) => ({
      campaignId: campaign.campaign.id,
      campaignName: campaign.campaign.name,
      clientName: campaign.clientName,
      portalUrl: campaign.portalUrl,
      billingPortalUrl: campaign.billingPortalUrl,
    })),
    null,
    2
  )}

HTML formatting rules for bodyHtml (CRITICAL):
- Wrap every paragraph in <p>...</p> tags. No exceptions.
- Never use <br> to separate paragraphs.
- Every distinct sentence, numbered item, or section must be its own <p> block.
- The sign-off (e.g. "Emily") must be its own <p> block, separated from the last paragraph.
- Example of correct output: <p>Hey Brett,</p><p>Your copy is ready in your portal: <a href="...">portal link</a></p><p>Take a look and approve when you're happy with it.</p><p>Emily</p>

Return JSON only with this shape:
{
  "subject": "...",
  "bodyHtml": "...",
  "bodyText": "...",
  "explanationSummary": "...",
  "explanation": "...",
  "confidence": 0-100,
  "missingDataFlags": ["..."],
  "safetyFlags": ["..."],
  "steps": [{"stepType":"fact","title":"...","content":"...","citations":["..."]}]
}`;

  const userPrompt = context.userInstruction
    ? `${context.userInstruction}

Primary instruction source: the Knowledge Base above.

IMPORTANT: If linked campaign data exists in the system prompt, you MUST use it. Use portal URLs and campaign details directly. Fetch onboarding status, billing status, or placement stats via tools if needed before drafting.`
    : `Draft a response for this inbound email thread.

Primary instruction source: the Knowledge Base above.

IMPORTANT: If linked campaign data exists in the system prompt, you MUST use it. Include portal URLs, campaign details, and any relevant information directly in your draft. Never tell a client you'll "get back to them" or "follow up" with information that is already available to you in the linked campaigns or via your tools.

If you need additional details (onboarding status, billing status, placement stats, capacity), use your tools to fetch them before drafting.

If no campaign data exists and you cannot find any via tools, draft a helpful reply using the knowledge base alone.

Thread:
${toTextThread(context.thread)}`;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];
  const toolCalls: EmailAgentToolResult[] = [];

  for (let round = 0; round < 5; round += 1) {
    const response = await anthropic.messages.create({
      model: DEFAULT_EMAIL_AGENT_MODEL,
      max_tokens: 3000,
      system: systemPrompt,
      tools,
      messages,
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const toolUseBlocks = response.content.filter((block) => block.type === "tool_use");

    if (toolUseBlocks.length === 0 && textBlock?.type === "text") {
      const result = parseDraftResult(textBlock.text);
      result.toolCalls = toolCalls;
      result.steps = [
        {
          stepType: "prompt",
          title: "Prompt version",
          content: `Used ${PROMPT_VERSION} with KB hash ${context.knowledgeBase.hash}.`,
          citations: [context.knowledgeBase.path],
        },
        ...result.steps,
      ];
      return { result, context };
    }

    messages.push({ role: "assistant", content: response.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      if (block.type !== "tool_use") continue;
      const executed = await executeTool(
        toolbox,
        block.name,
        block.input as Record<string, unknown>
      );
      toolCalls.push(executed);
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(executed.output, null, 2),
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  throw new Error("Email agent did not return a final response.");
}

export async function buildEmailAgentContextFromLinkedCampaigns(input: {
  mailbox: EmailMailboxRecord;
  thread: EmailThreadRecord;
  linkedCampaigns: EmailCampaignSummary[];
}): Promise<EmailAgentContext> {
  const [knowledgeBase, policyPrompt] = await Promise.all([
    loadEmailKnowledgeBase(),
    getEmailPolicyPrompt(),
  ]);

  return {
    mailbox: input.mailbox,
    thread: input.thread,
    linkedCampaigns: input.linkedCampaigns,
    policyPrompt,
    knowledgeBase,
  };
}

export async function generateEmailDraft(thread: EmailThreadRecord): Promise<{
  result: EmailAgentDraftResult;
  context: EmailAgentContext;
}> {
  const context = await buildEmailAgentContext(thread);
  return generateEmailDraftFromContext(context);
}

export { PROMPT_VERSION };
