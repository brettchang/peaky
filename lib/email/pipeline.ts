import Anthropic from "@anthropic-ai/sdk";
import {
  DEFAULT_EMAIL_AGENT_MODEL,
  DEFAULT_EMAIL_AGENT_POLICY_PROMPT,
  DEFAULT_EMAIL_RESOLVER_MODEL,
} from "./constants";
import {
  buildToolbox,
  buildTools,
  executeTool,
  parseDraftResult,
  toTextThread,
  PROMPT_VERSION,
} from "./agent";
import {
  getCampaignLookup,
  getCampaignSummaries,
  getEmailPolicyPrompt,
} from "./db";
import { loadEmailKnowledgeBase } from "./knowledge";
import type {
  CampaignResolverResult,
  ContextAssemblerResult,
  EmailAgentContext,
  EmailAgentDraftResult,
  EmailAgentToolResult,
  EmailCampaignSummary,
  EmailMailboxRecord,
  EmailPipelineResult,
  EmailThreadLinkInput,
  EmailThreadRecord,
} from "./types";

const anthropic = new Anthropic();

// ---------------------------------------------------------------------------
// Agent 1: Campaign Resolver
// ---------------------------------------------------------------------------

export async function resolveCampaigns(input: {
  thread: EmailThreadRecord;
  heuristicMatches: EmailThreadLinkInput[];
  model?: string;
}): Promise<CampaignResolverResult> {
  const allCampaigns = await getCampaignLookup();

  // Build a compact campaign table for the LLM
  const campaignTable = allCampaigns.map((entry) => ({
    id: entry.campaign.id,
    name: entry.campaign.name,
    clientName: entry.clientName,
    contactEmail: entry.campaign.contactEmail || "unknown",
    status: entry.campaign.status,
  }));

  const heuristicSummary = input.heuristicMatches.map((match) => ({
    campaignId: match.campaignId,
    confidence: match.confidence,
    matchReason: match.matchReason,
  }));

  const systemPrompt = `You are a campaign resolution agent for The Peak Media Co. Your ONLY job is to identify which campaign(s) an email thread relates to.

You are given:
1. An email thread (messages between clients and the ad ops team)
2. A list of all active campaigns with basic metadata
3. Pre-scored heuristic matches (from email/subject matching)

Your task:
- Analyze the email thread content to determine which campaign(s) it relates to
- Consider the heuristic matches as strong signals, but you can override them if the email content clearly points elsewhere
- A thread may relate to multiple campaigns (e.g. a client with several active campaigns discussing them together)
- If you cannot determine any campaign match, explain why

Return JSON only:
{
  "resolutions": [
    {
      "campaignId": "...",
      "confidence": 0-100,
      "reasoning": "Why this campaign matches",
      "matchSignals": ["signal1", "signal2"]
    }
  ],
  "primaryCampaignId": "highest-confidence campaign ID or null",
  "noMatchReason": "only if no campaigns matched"
}`;

  const userPrompt = `Heuristic pre-matches (from contact email and subject line matching):
${JSON.stringify(heuristicSummary, null, 2)}

All active campaigns:
${JSON.stringify(campaignTable, null, 2)}

Email thread:
${toTextThread(input.thread)}`;

  try {
    const response = await anthropic.messages.create({
      model: input.model || DEFAULT_EMAIL_RESOLVER_MODEL,
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Resolver returned no text response");
    }

    const rawJson =
      textBlock.text.match(/\{[\s\S]*"resolutions"[\s\S]*\}/)?.[0] || textBlock.text;
    const parsed = JSON.parse(rawJson) as CampaignResolverResult;

    // Ensure resolutions are sorted by confidence desc
    parsed.resolutions.sort((a, b) => b.confidence - a.confidence);
    parsed.primaryCampaignId = parsed.resolutions[0]?.campaignId ?? null;
    parsed.rawResponse = parsed as unknown as Record<string, unknown>;

    return parsed;
  } catch (error) {
    // On failure, fall back to heuristic matches
    console.error("[pipeline:resolver] LLM resolution failed, falling back to heuristics", error);
    const resolutions = input.heuristicMatches.map((match) => ({
      campaignId: match.campaignId,
      confidence: match.confidence,
      reasoning: `Heuristic fallback: ${match.matchReason}`,
      matchSignals: ["heuristic_fallback"],
    }));
    return {
      resolutions,
      primaryCampaignId: resolutions[0]?.campaignId ?? null,
      noMatchReason: resolutions.length === 0 ? "No heuristic matches and LLM resolution failed" : undefined,
    };
  }
}

// ---------------------------------------------------------------------------
// Agent 2: Context Assembler
// ---------------------------------------------------------------------------

export async function assembleContext(input: {
  thread: EmailThreadRecord;
  resolvedCampaignIds: string[];
  linkedCampaigns: EmailCampaignSummary[];
  knowledgeBase: { markdown: string; hash: string; path: string };
  model?: string;
}): Promise<ContextAssemblerResult> {
  // Build a toolbox that can look up campaign data
  const agentContext: EmailAgentContext = {
    mailbox: { id: "", emailAddress: "", provider: "nylas", grantStatus: "", createdAt: "", updatedAt: "" } as EmailMailboxRecord,
    thread: input.thread,
    linkedCampaigns: input.linkedCampaigns,
    knowledgeBase: input.knowledgeBase,
  };
  const toolbox = buildToolbox(agentContext);
  const tools = buildTools();

  const campaignSummaryList = input.linkedCampaigns.map((c) => ({
    campaignId: c.campaign.id,
    campaignName: c.campaign.name,
    clientName: c.clientName,
    portalUrl: c.portalUrl,
    billingPortalUrl: c.billingPortalUrl,
  }));

  const systemPrompt = `You are a context assembly agent for The Peak Media Co. Your job is NOT to write an email reply. Your job is to:

1. Read the email thread carefully and summarize what the client is asking or communicating
2. Classify their intent (e.g. "asking for portal link", "requesting stats", "scheduling question", "general inquiry", "sending copy", "asking about invoice", etc.)
3. Determine what action the email reply should accomplish
4. Use your tools to fetch ALL campaign data the drafter will need
5. Identify any constraints (things the drafter must include or avoid)

You have tools to fetch campaign details, portal URLs, onboarding status, billing status, schedule capacity, and placement stats. Use them proactively for every resolved campaign — the drafter will have NO tools, so fetch everything it might need.

Resolved campaigns (already matched to this thread):
${JSON.stringify(campaignSummaryList, null, 2)}

Return JSON only:
{
  "threadSummary": "What the client is asking/saying in 2-3 sentences",
  "clientIntent": "classified intent category",
  "actionNeeded": "What the reply email should accomplish",
  "campaigns": [
    {
      "campaignId": "...",
      "campaignName": "...",
      "clientName": "...",
      "status": "...",
      "portalUrl": "...",
      "billingPortalUrl": "...",
      "onboarding": { ... },
      "billing": { ... },
      "placementStats": { ... },
      "placements": [ { "id": "...", "name": "...", "type": "...", "status": "...", "scheduledDate": "...", "copyProducer": "..." } ],
      "adLineItems": [ ... ]
    }
  ],
  "constraints": ["constraint1", "constraint2"]
}`;

  const userPrompt = `Email thread:
${toTextThread(input.thread)}

Fetch all relevant data for the resolved campaigns using your tools, then return the structured context.`;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];
  const toolCalls: EmailAgentToolResult[] = [];

  for (let round = 0; round < 5; round += 1) {
    const response = await anthropic.messages.create({
      model: input.model || DEFAULT_EMAIL_AGENT_MODEL,
      max_tokens: 3000,
      system: systemPrompt,
      tools,
      messages,
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const toolUseBlocks = response.content.filter((block) => block.type === "tool_use");

    if (toolUseBlocks.length === 0 && textBlock?.type === "text") {
      const rawJson =
        textBlock.text.match(/\{[\s\S]*"threadSummary"[\s\S]*\}/)?.[0] || textBlock.text;
      const parsed = JSON.parse(rawJson) as ContextAssemblerResult;
      parsed.toolCalls = toolCalls;
      parsed.rawResponse = parsed as unknown as Record<string, unknown>;
      return parsed;
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

  throw new Error("Context assembler did not return a final response within 5 rounds.");
}

// ---------------------------------------------------------------------------
// Agent 3: Draft Writer
// ---------------------------------------------------------------------------

export async function writeDraft(input: {
  thread: EmailThreadRecord;
  assembledContext: ContextAssemblerResult;
  knowledgeBase: { markdown: string; hash: string; path: string };
  policyPrompt?: string;
  userInstruction?: string;
  model?: string;
}): Promise<EmailAgentDraftResult> {
  const systemPrompt = `${input.policyPrompt || DEFAULT_EMAIL_AGENT_POLICY_PROMPT}

Prompt version: ${PROMPT_VERSION}

Knowledge Base:
${input.knowledgeBase.markdown}

== PRE-ASSEMBLED CAMPAIGN CONTEXT ==
The following campaign data has already been fetched for you. Use it directly — do NOT say you'll "get back to them" or "follow up" with information that is available here.

Thread Summary: ${input.assembledContext.threadSummary}
Client Intent: ${input.assembledContext.clientIntent}
Action Needed: ${input.assembledContext.actionNeeded}
Constraints: ${input.assembledContext.constraints.join("; ") || "None"}

Campaign Data:
${JSON.stringify(input.assembledContext.campaigns, null, 2)}

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

  const userPrompt = input.userInstruction
    ? `${input.userInstruction}

Primary instruction source: the Knowledge Base above.

IMPORTANT: Use the pre-assembled campaign context directly. All campaign data has been pre-fetched for you.`
    : `Draft a response for this inbound email thread.

Primary instruction source: the Knowledge Base above.

IMPORTANT: Use the pre-assembled campaign context in the system prompt. All portal URLs, campaign details, onboarding status, billing status, and placement stats have been pre-fetched. Use them directly in your draft. Never tell a client you'll "get back to them" or "follow up" with information that is already available.

If the pre-assembled context has no campaign data and no information is available, draft a helpful reply using the knowledge base alone.

Thread:
${toTextThread(input.thread)}`;

  const response = await anthropic.messages.create({
    model: input.model || DEFAULT_EMAIL_AGENT_MODEL,
    max_tokens: 3000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Draft writer returned no text response");
  }

  const result = parseDraftResult(textBlock.text);
  result.steps = [
    {
      stepType: "prompt",
      title: "Prompt version",
      content: `Used ${PROMPT_VERSION} (pipeline mode) with KB hash ${input.knowledgeBase.hash}.`,
      citations: [input.knowledgeBase.path],
    },
    ...result.steps,
  ];

  return result;
}

// ---------------------------------------------------------------------------
// Pipeline Orchestrator
// ---------------------------------------------------------------------------

export async function runEmailPipeline(input: {
  thread: EmailThreadRecord;
  mailbox: EmailMailboxRecord;
  heuristicMatches: EmailThreadLinkInput[];
  userInstruction?: string;
}): Promise<EmailPipelineResult> {
  // Load knowledge base and policy prompt in parallel with Agent 1
  const [knowledgeBase, policyPrompt, resolverResult] = await Promise.all([
    loadEmailKnowledgeBase(),
    getEmailPolicyPrompt(),
    resolveCampaigns({
      thread: input.thread,
      heuristicMatches: input.heuristicMatches,
    }),
  ]);

  console.log(
    "[pipeline:resolver] Resolved campaigns:",
    JSON.stringify(resolverResult.resolutions.map((r) => ({
      campaignId: r.campaignId,
      confidence: r.confidence,
      reasoning: r.reasoning,
    })))
  );

  // Load full campaign summaries for resolved campaigns
  const resolvedCampaignIds = resolverResult.resolutions.map((r) => r.campaignId);
  const linkedCampaigns = await getCampaignSummaries(resolvedCampaignIds);

  // Agent 2: Assemble context
  const assemblerResult = await assembleContext({
    thread: input.thread,
    resolvedCampaignIds,
    linkedCampaigns,
    knowledgeBase,
  });

  console.log(
    "[pipeline:assembler] Context assembled:",
    JSON.stringify({
      threadSummary: assemblerResult.threadSummary,
      clientIntent: assemblerResult.clientIntent,
      actionNeeded: assemblerResult.actionNeeded,
      campaignCount: assemblerResult.campaigns.length,
      toolCallCount: assemblerResult.toolCalls.length,
    })
  );

  // Agent 3: Write the draft
  const draftResult = await writeDraft({
    thread: input.thread,
    assembledContext: assemblerResult,
    knowledgeBase,
    policyPrompt,
    userInstruction: input.userInstruction,
  });

  // Merge tool calls from assembler into the draft result
  draftResult.toolCalls = assemblerResult.toolCalls;

  // Prepend pipeline step entries for the resolver and assembler
  draftResult.steps = [
    {
      stepType: "campaign_resolution",
      title: "Campaign Resolver",
      content: resolverResult.primaryCampaignId
        ? `Resolved to campaign ${resolverResult.primaryCampaignId} with ${resolverResult.resolutions.length} match(es).`
        : resolverResult.noMatchReason || "No campaigns matched.",
      payload: { resolutions: resolverResult.resolutions },
    },
    {
      stepType: "context_assembly",
      title: "Context Assembler",
      content: `Intent: ${assemblerResult.clientIntent}. Action: ${assemblerResult.actionNeeded}. Fetched data for ${assemblerResult.campaigns.length} campaign(s) using ${assemblerResult.toolCalls.length} tool call(s).`,
      payload: {
        threadSummary: assemblerResult.threadSummary,
        clientIntent: assemblerResult.clientIntent,
        constraints: assemblerResult.constraints,
      },
    },
    ...draftResult.steps,
  ];

  return { resolverResult, assemblerResult, draftResult };
}
