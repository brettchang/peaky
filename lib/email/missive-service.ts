import { EMAIL_MAILBOX_ADDRESS, EMAIL_MAILBOX_ID, DEFAULT_EMAIL_AGENT_MODEL } from "./constants";
import { generateEmailDraftFromContext, PROMPT_VERSION } from "./agent";
import { runEmailPipeline } from "./pipeline";
import { cleanEmailSnippet, formatHtmlForMissiveComposer, htmlToReadableText } from "./content";
import {
  completeAgentRun,
  createAgentRun,
  createDraft,
  ensureMailbox,
  getCampaignLookup,
  getCampaignSummaries,
  getThreadById,
  markThreadAgentError,
  markWebhookEventProcessed,
  recordWebhookEvent,
  replaceThreadLinks,
  upsertMessage,
  upsertThread,
} from "./db";
import {
  createMissiveDraft,
  createMissiveNewDraft,
  createMissivePost,
  fetchMissiveConversation,
  fetchMissiveConversationMessages,
  getMissiveConfig,
  normalizeMissiveConversation,
  normalizeMissiveMessage,
  type MissiveConversation,
  type MissiveMessage,
  type MissiveWebhookPayload,
} from "./missive";
import { matchThreadToCampaigns } from "./matching";
import type { EmailParticipant, EmailThreadRecord } from "./types";

function firstValue(...values: Array<string | undefined>): string | undefined {
  return values.find(Boolean);
}

function isInternalEmailAddress(email?: string): boolean {
  if (!email) return false;
  const [, domain] = email.toLowerCase().split("@");
  if (!domain) return false;

  return (process.env.EMAIL_AGENT_INTERNAL_DOMAINS || "thepeakmediaco.com,readthepeak.com")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .includes(domain);
}

function combineParticipants(message: MissiveMessage): EmailParticipant[] {
  return [
    ...message.from.map((recipient) => ({ ...recipient, role: "from" as const })),
    ...message.to.map((recipient) => ({ ...recipient, role: "to" as const })),
    ...message.cc.map((recipient) => ({ ...recipient, role: "cc" as const })),
    ...message.bcc.map((recipient) => ({ ...recipient, role: "bcc" as const })),
  ];
}

function sortMessages(messages: MissiveMessage[]): MissiveMessage[] {
  return [...messages].sort((left, right) => {
    const leftTime = left.deliveredAt ? new Date(left.deliveredAt).getTime() : 0;
    const rightTime = right.deliveredAt ? new Date(right.deliveredAt).getTime() : 0;
    return leftTime - rightTime;
  });
}

function latestMessage(messages: MissiveMessage[]): MissiveMessage | undefined {
  return sortMessages(messages).at(-1);
}

function normalizeConversationUrl(conversation: MissiveConversation): string | undefined {
  return firstValue(conversation.appUrl, conversation.webUrl);
}

function triggerCommentBody(payload: MissiveWebhookPayload): string | undefined {
  if (typeof payload.comment?.body === "string") return payload.comment.body;
  if (typeof payload.latest_comment?.body === "string") return payload.latest_comment.body;
  return undefined;
}

function shouldTriggerDraft(payload: MissiveWebhookPayload, conversation: MissiveConversation): boolean {
  const ruleType = payload.rule?.type?.toLowerCase();
  if (ruleType === "new_comment") {
    const trigger = getMissiveConfig().webhookTriggerPrefix.toLowerCase();
    const body = triggerCommentBody(payload)?.toLowerCase();
    if (!body) {
      return true;
    }
    return body.includes(trigger);
  }

  if (ruleType === "incoming_email") {
    return (conversation.draftsCount ?? 0) === 0;
  }

  return false;
}

function buildWebhookEventId(
  payload: MissiveWebhookPayload,
  conversation: MissiveConversation,
  message?: MissiveMessage
): string {
  const ruleId =
    payload.rule?.id !== undefined && payload.rule?.id !== null ? String(payload.rule.id) : "no-rule";
  const commentId =
    payload.comment?.id !== undefined && payload.comment?.id !== null
      ? String(payload.comment.id)
      : payload.latest_comment?.id !== undefined && payload.latest_comment?.id !== null
        ? String(payload.latest_comment.id)
        : "no-comment";
  return ["missive", ruleId, conversation.id, message?.id || "no-message", commentId].join(":");
}

async function ensureMissiveMailbox() {
  return ensureMailbox({
    id: EMAIL_MAILBOX_ID,
    emailAddress: EMAIL_MAILBOX_ADDRESS,
    displayName: "Peak Ad Ops",
  });
}

async function loadConversationFromWebhook(
  payload: MissiveWebhookPayload
): Promise<{ conversation: MissiveConversation; messages: MissiveMessage[] }> {
  const inlineConversation = normalizeMissiveConversation(payload.conversation);
  const conversationId =
    inlineConversation?.id ||
    (typeof payload.latest_message === "object" &&
    payload.latest_message &&
    "conversation" in payload.latest_message
      ? String((payload.latest_message as Record<string, unknown>).conversation)
      : undefined);

  if (!conversationId) {
    throw new Error("Missive webhook payload did not include a conversation ID.");
  }

  const [conversation, messages] = await Promise.all([
    inlineConversation ? Promise.resolve(inlineConversation) : fetchMissiveConversation(conversationId),
    fetchMissiveConversationMessages(conversationId),
  ]);

  if (messages.length === 0) {
    const inlineMessage = normalizeMissiveMessage(payload.latest_message);
    if (inlineMessage) {
      return { conversation, messages: [inlineMessage] };
    }
  }

  return { conversation, messages };
}

async function syncMissiveConversationToThread(input: {
  mailboxId: string;
  conversation: MissiveConversation;
  messages: MissiveMessage[];
}): Promise<EmailThreadRecord> {
  const orderedMessages = sortMessages(input.messages);
  const lastMessage = orderedMessages.at(-1);
  const participants = orderedMessages.flatMap(combineParticipants);
  const thread = await upsertThread({
    mailboxId: input.mailboxId,
    nylasThreadId: input.conversation.id,
    subject:
      input.conversation.subject ||
      lastMessage?.subject ||
      "(No subject)",
    snippet: cleanEmailSnippet(input.conversation.preview || lastMessage?.preview),
    participants,
    unread: true,
    inboundOnly: orderedMessages.every(
      (message) => message.from.every((recipient) => !isInternalEmailAddress(recipient.email))
    ),
    lastMessageAt: lastMessage?.deliveredAt ? new Date(lastMessage.deliveredAt) : undefined,
    latestMessageId: lastMessage?.id,
    metadata: {
      provider: "missive",
      conversationId: input.conversation.id,
      conversationUrl: normalizeConversationUrl(input.conversation),
      rawConversation: input.conversation.raw,
    },
  });

  for (const message of orderedMessages) {
    const from = message.from[0];
    await upsertMessage({
      mailboxId: input.mailboxId,
      threadId: thread.id,
      nylasMessageId: message.id,
      direction: isInternalEmailAddress(from?.email) ? "outbound" : "inbound",
      subject: message.subject || thread.subject,
      fromName: from?.name,
      fromEmail: from?.email,
      toRecipients: message.to,
      ccRecipients: message.cc,
      bccRecipients: message.bcc,
      participants: combineParticipants(message),
      sentAt: message.deliveredAt ? new Date(message.deliveredAt) : undefined,
      bodyHtml: message.body,
      bodyText: htmlToReadableText(message.body),
      snippet: cleanEmailSnippet(message.preview),
      rawPayload: {
        provider: "missive",
        ...message.raw,
      },
    });
  }

  const messageBodies = orderedMessages.flatMap((message) => {
    const body = `${message.body || ""} ${message.preview || ""}`;
    return body.match(/https?:\/\/\S+/g) ?? [];
  });

  const links = await matchThreadToCampaigns({
    participants,
    subject: thread.subject,
    portalUrls: messageBodies,
  });
  await replaceThreadLinks(thread.id, links);

  const refreshed = await getThreadById(thread.id);
  if (!refreshed) {
    throw new Error("Failed to load Missive-backed thread.");
  }
  return refreshed;
}

function buildAuditPost(input: {
  confidence: number;
  explanationSummary: string;
  missingDataFlags: string[];
  conversationUrl?: string;
}): string {
  const parts = [
    `AI draft created in Missive.`,
    `Confidence: ${input.confidence}.`,
    input.explanationSummary,
  ];

  if (input.missingDataFlags.length > 0) {
    parts.push(`Missing data: ${input.missingDataFlags.join(", ")}.`);
  }
  if (input.conversationUrl) {
    parts.push(`[Open conversation](${input.conversationUrl})`);
  }

  return parts.join("\n\n");
}

export async function processMissiveWebhookPayload(payload: MissiveWebhookPayload): Promise<{
  skipped: boolean;
  reason?: string;
  threadId?: string;
  draftId?: string;
  missiveDraftId?: string;
}> {
  const mailbox = await ensureMissiveMailbox();
  const { conversation, messages } = await loadConversationFromWebhook(payload);
  let syncedThreadId: string | undefined;

  if (!shouldTriggerDraft(payload, conversation)) {
    return { skipped: true, reason: "Webhook event did not match the configured AI trigger." };
  }

  const lastMessage = latestMessage(messages);
  const eventType = `missive.${payload.rule?.type || "event"}`;
  const recorded = await recordWebhookEvent({
    mailboxId: mailbox.id,
    externalEventId: buildWebhookEventId(payload, conversation, lastMessage),
    eventType,
    payload: {
      provider: "missive",
      ...payload,
    },
  });

  if (!recorded.inserted) {
    return { skipped: true, reason: "Webhook event already processed." };
  }

  try {
    const thread = await syncMissiveConversationToThread({
      mailboxId: mailbox.id,
      conversation,
      messages,
    });
    syncedThreadId = thread.id;
    console.log("[missive-webhook] Heuristic links:", JSON.stringify(thread.links.map((link) => ({
      campaignId: link.campaignId,
      confidence: link.confidence,
      matchReason: link.matchReason,
    }))));

    // Convert thread links to heuristic match format for the pipeline
    const heuristicMatches = thread.links.map((link) => ({
      campaignId: link.campaignId,
      confidence: link.confidence,
      isPrimary: link.isPrimary,
      matchReason: link.matchReason,
      source: link.source,
      metadata: link.metadata,
    }));

    const runId = await createAgentRun({
      mailboxId: mailbox.id,
      threadId: thread.id,
      triggerMessageId: thread.latestMessageId,
      model: DEFAULT_EMAIL_AGENT_MODEL,
      promptVersion: PROMPT_VERSION,
      knowledgeBaseHash: "",
      knowledgeBasePath: "",
    });

    // Run the 3-agent pipeline: Resolver → Assembler → Writer
    const { resolverResult, draftResult: result } = await runEmailPipeline({
      thread,
      mailbox,
      heuristicMatches,
    });

    // Update thread links with LLM-resolved campaigns (may differ from heuristics)
    if (resolverResult.resolutions.length > 0) {
      const resolvedLinks = resolverResult.resolutions.map((r, index) => ({
        campaignId: r.campaignId,
        confidence: r.confidence,
        isPrimary: index === 0,
        matchReason: `[pipeline] ${r.reasoning}`,
        source: "auto" as const,
        metadata: { matchSignals: r.matchSignals },
      }));
      await replaceThreadLinks(thread.id, resolvedLinks);
    }
    const formattedBodyHtml = formatHtmlForMissiveComposer({
      bodyHtml: result.bodyHtml,
      bodyText: result.bodyText,
    });
    const missiveDraft = await createMissiveDraft({
      conversationId: conversation.id,
      subject: result.subject,
      bodyHtml: formattedBodyHtml,
    });

    await completeAgentRun({
      runId,
      status: "completed",
      confidence: result.confidence,
      rationaleSummary: result.explanationSummary,
      missingDataFlags: result.missingDataFlags,
      safetyFlags: result.safetyFlags,
      toolCalls: result.toolCalls as unknown as Array<Record<string, unknown>>,
      rawResponse: result.rawResponse,
      steps: result.steps,
    });

    const storedDraft = await createDraft({
      mailboxId: mailbox.id,
      threadId: thread.id,
      runId,
      subject: result.subject,
      bodyHtml: formattedBodyHtml,
      bodyText: result.bodyText,
      explanation: result.explanation,
      explanationSummary: result.explanationSummary,
      explanationPayload: {
        provider: "missive",
        missiveConversationId: conversation.id,
        missiveConversationUrl: normalizeConversationUrl(conversation),
        missiveDraftId: missiveDraft.id,
        confidence: result.confidence,
        missingDataFlags: result.missingDataFlags,
        safetyFlags: result.safetyFlags,
        knowledgeBaseHash: "",
        promptVersion: `${PROMPT_VERSION} (pipeline)`,
      },
      nylasDraftId: missiveDraft.id,
    });

    try {
      await createMissivePost({
        conversationId: conversation.id,
        markdown: buildAuditPost({
          confidence: result.confidence,
          explanationSummary: result.explanationSummary,
          missingDataFlags: result.missingDataFlags,
          conversationUrl: normalizeConversationUrl(conversation),
        }),
      });
    } catch (error) {
      console.error("Missive draft created but audit post failed", {
        conversationId: conversation.id,
        threadId: thread.id,
        error: error instanceof Error ? error.message : error,
      });
    }

    await markWebhookEventProcessed(recorded.id);

    return {
      skipped: false,
      threadId: thread.id,
      draftId: storedDraft.id,
      missiveDraftId: missiveDraft.id,
    };
  } catch (error) {
    const thread = syncedThreadId ? await getThreadById(syncedThreadId) : undefined;
    if (thread?.id) {
      await markThreadAgentError(thread.id);
    }
    await markWebhookEventProcessed(
      recorded.id,
      error instanceof Error ? error.message : "Unknown Missive webhook processing error"
    );
    throw error;
  }
}

/** Extract a Missive conversation ID from a URL or bare ID in the instruction. */
function extractMissiveConversationId(instruction: string): string | null {
  // Match URLs like https://mail.missiveapp.com/conversations/<id> or missive://<id>
  const urlMatch = instruction.match(
    /(?:https:\/\/mail\.missiveapp\.com\/[^/]*\/conversations\/|missive:\/\/)([a-f0-9-]+)/i
  );
  if (urlMatch) return urlMatch[1];
  return null;
}

/** Strip the Missive URL from the instruction so the agent gets clean text. */
function stripMissiveUrl(instruction: string): string {
  return instruction
    .replace(/https:\/\/mail\.missiveapp\.com\/\S+/gi, "")
    .replace(/missive:\/\/\S+/gi, "")
    .trim();
}

export async function processSlackEmailAgentCommand(instruction: string): Promise<{
  subject: string;
  missiveConversationUrl?: string;
  clientName?: string;
  confidence: number;
  explanationSummary: string;
}> {
  const mailbox = await ensureMissiveMailbox();
  const allCampaigns = await getCampaignLookup();
  const campaignList = allCampaigns
    .map((c) => `- Campaign ID: ${c.campaign.id} | Client: ${c.clientName} | Name: ${c.campaign.name} | Contact: ${c.campaign.contactEmail || "unknown"}`)
    .join("\n");

  // Check if the user pasted a Missive conversation URL to reply to
  const replyConversationId = extractMissiveConversationId(instruction);
  const cleanInstruction = replyConversationId ? stripMissiveUrl(instruction) : instruction;

  // If replying to an existing thread, load the conversation messages for context
  let existingMessages = "";
  let conversationSubject = "";
  if (replyConversationId) {
    const [conversation, messages] = await Promise.all([
      fetchMissiveConversation(replyConversationId),
      fetchMissiveConversationMessages(replyConversationId),
    ]);
    conversationSubject = conversation.subject || "";
    existingMessages = messages
      .map((m) => {
        const sender = m.from[0];
        return `From: ${sender?.name || sender?.email || "unknown"}\nDate: ${m.deliveredAt || ""}\n\n${m.body || m.preview || ""}`;
      })
      .join("\n---\n");
  }

  const syntheticThread = {
    id: replyConversationId ?? "slack-initiated",
    mailboxId: mailbox.id,
    subject: conversationSubject || "(Slack-initiated draft)",
    snippet: cleanInstruction,
    participants: [],
    messages: [],
    links: [],
    unread: false,
    inboundOnly: true,
    noReplyNeeded: false,
    agentError: false,
    drafts: [],
    currentDraft: null,
    nylasThreadId: "",
    lastMessageAt: null,
    latestMessageId: null,
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as unknown as import("./types").EmailThreadRecord;

  const [knowledgeBase, policyPrompt] = await Promise.all([
    (await import("./knowledge")).loadEmailKnowledgeBase(),
    (await import("./db")).getEmailPolicyPrompt(),
  ]);

  // Load all campaigns as linked so the agent can identify the right one
  const linkedCampaigns = await getCampaignSummaries(allCampaigns.map((c) => c.campaign.id));

  const threadContext = replyConversationId
    ? `You are replying to an existing email thread. Here is the conversation so far:\n\nSubject: ${conversationSubject}\n\n${existingMessages}\n\n---\n\nThe ad ops team wants you to draft a reply based on this instruction:\n\n"${cleanInstruction}"\n\nAll active campaigns are listed below. Identify the correct campaign from the thread or instruction, then draft the reply.\n\nCampaigns:\n${campaignList}\n\nUse your tools to fetch any additional context (placement stats, onboarding status, etc.) before drafting.`
    : `You are being asked to draft a new outbound email based on this instruction from the ad ops team:\n\n"${cleanInstruction}"\n\nAll active campaigns are listed below. Identify the correct campaign from the instruction, then draft the email to the client's contact.\n\nCampaigns:\n${campaignList}\n\nUse your tools to fetch any additional context (placement stats, onboarding status, etc.) before drafting. The draft will be created as a new email in Missive — not a reply to an existing thread.`;

  const context = {
    mailbox,
    thread: syntheticThread,
    linkedCampaigns,
    policyPrompt,
    knowledgeBase,
    userInstruction: threadContext,
  };

  const { result } = await generateEmailDraftFromContext(context);

  // Find the matched campaign's contact email to address the draft
  const matchedCampaign = linkedCampaigns.find((c) =>
    result.explanation?.includes(c.campaign.id) || result.explanationSummary?.includes(c.clientName)
  ) ?? linkedCampaigns[0];

  const contactEmail = matchedCampaign?.campaign.contactEmail;
  const contactName = matchedCampaign?.campaign.contactName;
  const clientName = matchedCampaign?.clientName;

  const formattedBodyHtml = formatHtmlForMissiveComposer({
    bodyHtml: result.bodyHtml,
    bodyText: result.bodyText,
  });

  let missiveConversationUrl: string | undefined;

  if (replyConversationId) {
    // Reply to the existing conversation
    await createMissiveDraft({
      conversationId: replyConversationId,
      subject: conversationSubject ? `Re: ${conversationSubject}` : result.subject,
      bodyHtml: formattedBodyHtml,
    });
    missiveConversationUrl = `https://mail.missiveapp.com/#/conversations/${replyConversationId}`;
  } else {
    // Create a new outbound email
    const missiveDraft = await createMissiveNewDraft({
      to: contactEmail ? [{ address: contactEmail, name: contactName ?? undefined }] : [],
      subject: result.subject,
      bodyHtml: formattedBodyHtml,
    });
    missiveConversationUrl = missiveDraft.conversationUrl;
  }

  return {
    subject: replyConversationId && conversationSubject ? `Re: ${conversationSubject}` : result.subject,
    missiveConversationUrl,
    clientName,
    confidence: result.confidence,
    explanationSummary: result.explanationSummary,
  };
}
