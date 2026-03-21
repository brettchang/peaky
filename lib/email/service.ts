import {
  DEFAULT_EMAIL_AGENT_MODEL,
  EMAIL_MAILBOX_ADDRESS,
  EMAIL_MAILBOX_ID,
} from "./constants";
import { getNylasConfig } from "./config";
import { cleanEmailSnippet, htmlToReadableText, replyTextToHtml } from "./content";
import {
  completeAgentRun,
  createAgentRun,
  createDraft,
  ensureMailbox,
  getMailboxByEmail,
  getThreadById,
  markThreadAgentError,
  listThreads,
  markWebhookEventProcessed,
  recordWebhookEvent,
  replaceThreadLinks,
  touchMailboxSync,
  updateDraft,
  updateMailboxConnection,
  upsertMessage,
  upsertThread,
} from "./db";
import { generateEmailDraft, PROMPT_VERSION } from "./agent";
import { matchThreadToCampaigns } from "./matching";
import {
  createNylasDraft,
  createNylasHostedAuthUrl,
  exchangeNylasCode,
  listNylasMessagesForThread,
  listNylasThreads,
  sendNylasDraft,
  updateNylasDraft,
} from "./nylas";
import type {
  EmailMailboxRecord,
  EmailNylasMessage,
  EmailNylasThread,
  EmailParticipant,
  EmailRecipient,
  EmailThreadRecord,
} from "./types";

function resolveInternalEmailDomains(): string[] {
  const raw =
    process.env.CAMPAIGN_EMAIL_INTERNAL_DOMAINS?.trim() ||
    process.env.EMAIL_AGENT_INTERNAL_DOMAINS?.trim() ||
    "thepeakmediaco.com,readthepeak.com";
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function isInternalEmailAddress(email?: string): boolean {
  if (!email) return false;
  const [, domain] = email.toLowerCase().split("@");
  if (!domain) return false;
  return resolveInternalEmailDomains().includes(domain);
}

function toDate(seconds?: number): Date | undefined {
  if (!seconds) return undefined;
  const value = seconds > 10_000_000_000 ? seconds : seconds * 1000;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function combineParticipants(message: EmailNylasMessage): EmailParticipant[] {
  return [
    ...(message.from ?? []).map((recipient) => ({ ...recipient, role: "from" as const })),
    ...(message.to ?? []).map((recipient) => ({ ...recipient, role: "to" as const })),
    ...(message.cc ?? []).map((recipient) => ({ ...recipient, role: "cc" as const })),
    ...(message.bcc ?? []).map((recipient) => ({ ...recipient, role: "bcc" as const })),
  ];
}

function firstExternalRecipient(thread: EmailThreadRecord): EmailRecipient[] {
  const lastInbound = [...thread.messages]
    .reverse()
    .find((message) => message.direction === "inbound");
  if (!lastInbound) return [];
  if (lastInbound.fromEmail && !isInternalEmailAddress(lastInbound.fromEmail)) {
    return [{ email: lastInbound.fromEmail, name: lastInbound.fromName }];
  }

  const recipients = [...lastInbound.toRecipients, ...lastInbound.ccRecipients].filter(
    (recipient) => recipient.email && !isInternalEmailAddress(recipient.email)
  );
  return recipients.map((recipient) => ({
    email: recipient.email,
    name: recipient.name,
  }));
}

function getLatestMessage(thread: EmailThreadRecord) {
  return [...thread.messages]
    .sort((a, b) => {
      const left = a.sentAt ? new Date(a.sentAt).getTime() : 0;
      const right = b.sentAt ? new Date(b.sentAt).getTime() : 0;
      return left - right;
    })
    .at(-1);
}

function shouldAutoDraftDuringSync(
  thread: EmailThreadRecord,
  previousLastSyncedAt?: string
): boolean {
  const latestMessage = getLatestMessage(thread);
  if (!latestMessage || latestMessage.direction !== "inbound") {
    return false;
  }

  if (thread.unread) {
    return true;
  }

  if (!previousLastSyncedAt || !thread.lastMessageAt) {
    return false;
  }

  const previousSync = new Date(previousLastSyncedAt).getTime();
  const lastMessageAt = new Date(thread.lastMessageAt).getTime();
  if (Number.isNaN(previousSync) || Number.isNaN(lastMessageAt)) {
    return false;
  }

  return lastMessageAt > previousSync;
}

function shouldGenerateDraft(thread: EmailThreadRecord): boolean {
  if (thread.noReplyNeeded) {
    return false;
  }

  const latestMessage = getLatestMessage(thread);
  if (!latestMessage || latestMessage.direction !== "inbound") {
    return false;
  }

  const currentDraft = thread.currentDraft;
  if (!currentDraft) {
    return true;
  }

  if (currentDraft.status === "stale" || currentDraft.status === "rejected") {
    return true;
  }

  const lastMessageAt = thread.lastMessageAt ? new Date(thread.lastMessageAt).getTime() : 0;
  const draftUpdatedAt = currentDraft.updatedAt ? new Date(currentDraft.updatedAt).getTime() : 0;
  if (lastMessageAt > draftUpdatedAt) {
    return true;
  }

  return false;
}

export async function ensurePrimaryMailbox(): Promise<EmailMailboxRecord> {
  const mailbox = await ensureMailbox({
    id: EMAIL_MAILBOX_ID,
    emailAddress: EMAIL_MAILBOX_ADDRESS,
    displayName: "Peak Ad Ops",
  });

  const config = getNylasConfig();
  if (config.grantId && mailbox.nylasGrantId !== config.grantId) {
    await updateMailboxConnection({
      mailboxId: mailbox.id,
      nylasGrantId: config.grantId,
      nylasAccountId: config.accountId ?? mailbox.nylasAccountId ?? null,
      grantStatus: "connected",
      providerMetadata: {
        source: "env",
        configuredAt: new Date().toISOString(),
      },
    });
    return (await getMailboxByEmail(mailbox.emailAddress)) as EmailMailboxRecord;
  }

  return mailbox;
}

export function encodeEmailAuthState(input: {
  mailboxId: string;
  returnTo?: string;
}): string {
  return Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
}

export function decodeEmailAuthState(state?: string | null): {
  mailboxId: string;
  returnTo?: string;
} {
  if (!state) {
    return { mailboxId: EMAIL_MAILBOX_ID };
  }
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as {
      mailboxId?: string;
      returnTo?: string;
    };
    return {
      mailboxId: parsed.mailboxId || EMAIL_MAILBOX_ID,
      returnTo: parsed.returnTo,
    };
  } catch {
    return { mailboxId: EMAIL_MAILBOX_ID };
  }
}

export function getEmailAuthStartUrl(returnTo?: string): string {
  return createNylasHostedAuthUrl(
    encodeEmailAuthState({
      mailboxId: EMAIL_MAILBOX_ID,
      returnTo,
    })
  );
}

export async function completeHostedAuth(input: {
  code?: string;
  grantId?: string;
  accountId?: string;
  email?: string;
  payload?: Record<string, unknown>;
}): Promise<EmailMailboxRecord> {
  const mailbox = await ensurePrimaryMailbox();
  let grantId = input.grantId;
  let accountId = input.accountId;
  let metadata = input.payload ?? {};

  if (input.code) {
    const token = await exchangeNylasCode(input.code);
    grantId =
      typeof token.grant_id === "string"
        ? token.grant_id
        : typeof token.grantId === "string"
          ? token.grantId
          : grantId;
    accountId =
      typeof token.account_id === "string"
        ? token.account_id
        : typeof token.accountId === "string"
          ? token.accountId
          : accountId;
    metadata = token;
  }

  await updateMailboxConnection({
    mailboxId: mailbox.id,
    nylasGrantId: grantId ?? null,
    nylasAccountId: accountId ?? null,
    grantStatus: grantId ? "connected" : "pending",
    providerMetadata: metadata,
  });

  return (await getMailboxByEmail(mailbox.emailAddress)) as EmailMailboxRecord;
}

export async function syncMailboxThreads(input?: {
  threadLimit?: number;
}): Promise<EmailThreadRecord[]> {
  const mailbox = await ensurePrimaryMailbox();
  if (!mailbox.nylasGrantId) {
    return listThreads(mailbox.id);
  }
  const remoteThreads = (
    await listNylasThreads(mailbox.nylasGrantId, {
      limit: input?.threadLimit ?? 25,
    })
  ).sort((left, right) => {
    const leftTime = left.latestMessageReceivedDate ?? 0;
    const rightTime = right.latestMessageReceivedDate ?? 0;
    return rightTime - leftTime;
  });

  for (const remoteThread of remoteThreads) {
    const thread = await syncRemoteThread(mailbox.id, mailbox.nylasGrantId, remoteThread);
    if (!shouldGenerateDraft(thread)) {
      continue;
    }
    if (!shouldAutoDraftDuringSync(thread, mailbox.lastSyncedAt)) {
      continue;
    }
    try {
      await rerunDraftAgent(thread.id);
    } catch (error) {
      console.error("Failed to auto-generate email draft during sync", {
        threadId: thread.id,
        nylasThreadId: thread.nylasThreadId,
        error: error instanceof Error ? error.message : error,
      });
    }
  }
  await touchMailboxSync(mailbox.id);
  return listThreads(mailbox.id);
}

export async function syncRemoteThread(
  mailboxId: string,
  grantId: string,
  remoteThread: EmailNylasThread
): Promise<EmailThreadRecord> {
  const remoteMessages = await listNylasMessagesForThread(grantId, remoteThread.id);
  const lastMessage = [...remoteMessages].sort((a, b) => (a.date || 0) - (b.date || 0)).at(-1);
  const participants = remoteMessages.flatMap(combineParticipants);

  const thread = await upsertThread({
    mailboxId,
    nylasThreadId: remoteThread.id,
    subject: remoteThread.subject || lastMessage?.subject || "(No subject)",
    snippet: lastMessage?.snippet || remoteThread.snippet,
    participants,
    unread: remoteThread.unread ?? true,
    inboundOnly: remoteMessages.every(
      (message) => message.from?.[0]?.email?.toLowerCase() !== EMAIL_MAILBOX_ADDRESS
    ),
    lastMessageAt: toDate(lastMessage?.date),
    latestMessageId: lastMessage?.id,
    metadata: remoteThread.raw,
  });

  for (const message of remoteMessages) {
    const from = message.from?.[0];
    await upsertMessage({
      mailboxId,
      threadId: thread.id,
      nylasMessageId: message.id,
      direction: from?.email === EMAIL_MAILBOX_ADDRESS ? "outbound" : "inbound",
      subject: message.subject || thread.subject,
      fromName: from?.name,
      fromEmail: from?.email,
      toRecipients: message.to ?? [],
      ccRecipients: message.cc ?? [],
      bccRecipients: message.bcc ?? [],
      participants: combineParticipants(message),
      sentAt: toDate(message.date),
      bodyHtml: message.body,
      bodyText: htmlToReadableText(message.body),
      snippet: cleanEmailSnippet(message.snippet),
      rawPayload: message.raw,
    });
  }

  const refreshed = await getThreadById(thread.id);
  if (!refreshed) {
    throw new Error("Failed to load synced thread.");
  }

  const links = await matchThreadToCampaigns({
    participants: refreshed.participants,
    subject: refreshed.subject,
    previousCampaignIds: refreshed.links.map((link) => link.campaignId),
    portalUrls: refreshed.messages.flatMap((message) => {
      const body = `${message.bodyText || ""} ${message.bodyHtml || ""}`;
      return body.match(/https?:\/\/\S+/g) ?? [];
    }),
  });
  await replaceThreadLinks(refreshed.id, links);
  const finalThread = await getThreadById(refreshed.id);
  if (!finalThread) throw new Error("Failed to refresh thread links.");
  return finalThread;
}

export async function rerunDraftAgent(threadId: string): Promise<EmailThreadRecord> {
  const thread = await getThreadById(threadId);
  if (!thread) throw new Error("Thread not found.");
  const mailbox = await ensurePrimaryMailbox();
  const runId = await createAgentRun({
    mailboxId: mailbox.id,
    threadId,
    triggerMessageId: thread.latestMessageId,
    model: DEFAULT_EMAIL_AGENT_MODEL,
    promptVersion: PROMPT_VERSION,
  });

  try {
    const { result, context } = await generateEmailDraft(thread);
    let nylasDraftId: string | undefined;
    if (mailbox.nylasGrantId) {
      const isReply = thread.messages.length > 0;
      const replySubject = thread.subject?.startsWith("Re:") ? thread.subject : `Re: ${thread.subject || result.subject}`;
      const draft = await createNylasDraft({
        grantId: mailbox.nylasGrantId,
        threadId: thread.nylasThreadId,
        subject: isReply ? replySubject : result.subject,
        bodyHtml: result.bodyHtml,
        to: firstExternalRecipient(thread),
        replyToMessageId: thread.latestMessageId,
      });
      nylasDraftId = draft.id;
    }

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

    await createDraft({
      mailboxId: mailbox.id,
      threadId,
      runId,
      subject: result.subject,
      bodyHtml: result.bodyHtml,
      bodyText: result.bodyText,
      explanation: result.explanation,
      explanationSummary: result.explanationSummary,
      explanationPayload: {
        confidence: result.confidence,
        missingDataFlags: result.missingDataFlags,
        safetyFlags: result.safetyFlags,
        toolCalls: result.toolCalls,
        knowledgeBaseHash: context.knowledgeBase.hash,
        promptVersion: PROMPT_VERSION,
      },
      nylasDraftId,
    });
  } catch (error) {
    await completeAgentRun({
      runId,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Email agent failed.",
      steps: [
        {
          stepType: "error",
          title: "Agent run failed",
          content: error instanceof Error ? error.message : "Unknown error",
        },
      ],
    });
    await markThreadAgentError(threadId);
    throw error;
  }

  const refreshed = await getThreadById(threadId);
  if (!refreshed) throw new Error("Thread not found after rerun.");
  return refreshed;
}

export async function syncAndMaybeDraftThread(threadId: string): Promise<EmailThreadRecord> {
  const mailbox = await ensurePrimaryMailbox();
  if (!mailbox.nylasGrantId) {
    const thread = await getThreadById(threadId);
    if (!thread) throw new Error("Thread not found.");
    return rerunDraftAgent(threadId);
  }
  const thread = await getThreadById(threadId);
  if (!thread) throw new Error("Thread not found.");
  const remoteThread = {
    id: thread.nylasThreadId,
    subject: thread.subject,
    participants: thread.participants,
    unread: thread.unread,
    raw: {},
  };
  await syncRemoteThread(mailbox.id, mailbox.nylasGrantId, remoteThread);
  return rerunDraftAgent(threadId);
}

export async function saveDraftEdits(input: {
  draftId: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
}): Promise<void> {
  const mailbox = await ensurePrimaryMailbox();
  const thread = await listThreads(mailbox.id);
  const owningThread = thread.find((item) => item.currentDraft?.id === input.draftId || item.drafts.some((draft) => draft.id === input.draftId));
  const draft = owningThread?.drafts.find((candidate) => candidate.id === input.draftId);
  if (!draft) throw new Error("Draft not found.");
  if (mailbox.nylasGrantId && draft.nylasDraftId) {
    await updateNylasDraft({
      grantId: mailbox.nylasGrantId,
      draftId: draft.nylasDraftId,
      subject: input.subject,
      bodyHtml: input.bodyHtml,
    });
  }
  await updateDraft({
    draftId: input.draftId,
    subject: input.subject,
    bodyHtml: input.bodyHtml,
    bodyText: input.bodyText,
  });
}

export async function createManualDraft(input: {
  threadId: string;
  subject: string;
  bodyText: string;
}): Promise<EmailThreadRecord> {
  const mailbox = await ensurePrimaryMailbox();
  const thread = await getThreadById(input.threadId);
  if (!thread) {
    throw new Error("Thread not found.");
  }

  const bodyText = input.bodyText.trim();
  const bodyHtml = replyTextToHtml(bodyText);
  const subject = input.subject.trim() || `Re: ${thread.subject || "(No subject)"}`;

  let nylasDraftId: string | undefined;
  if (mailbox.nylasGrantId) {
    const draft = await createNylasDraft({
      grantId: mailbox.nylasGrantId,
      threadId: thread.nylasThreadId,
      subject,
      bodyHtml,
      to: firstExternalRecipient(thread),
      replyToMessageId: thread.latestMessageId,
    });
    nylasDraftId = draft.id;
  }

  await createDraft({
    mailboxId: mailbox.id,
    threadId: thread.id,
    subject,
    bodyHtml,
    bodyText,
    explanationSummary: "Manual reply created in Peak Portal.",
    nylasDraftId,
  });

  const refreshed = await getThreadById(thread.id);
  if (!refreshed) {
    throw new Error("Thread not found after creating manual draft.");
  }
  return refreshed;
}

export async function approveDraft(draftId: string, approvedBy = "portal-reviewer"): Promise<void> {
  await updateDraft({
    draftId,
    status: "approved",
    approvedBy,
  });
}

export async function rejectDraft(draftId: string): Promise<void> {
  await updateDraft({
    draftId,
    status: "rejected",
  });
}

export async function sendDraft(draftId: string): Promise<void> {
  const mailbox = await ensurePrimaryMailbox();
  const threads = await listThreads(mailbox.id);
  const thread = threads.find((candidate) => candidate.drafts.some((draft) => draft.id === draftId));
  const draft = thread?.drafts.find((candidate) => candidate.id === draftId);
  if (!thread || !draft) {
    throw new Error("Draft not found.");
  }
  if (draft.status === "rejected" || draft.status === "stale" || draft.status === "sent") {
    throw new Error("Draft is not sendable in its current state.");
  }
  if (!mailbox.nylasGrantId || !draft.nylasDraftId) {
    throw new Error("Draft is not connected to Nylas.");
  }
  await sendNylasDraft({
    grantId: mailbox.nylasGrantId,
    draftId: draft.nylasDraftId,
  });
  await updateDraft({
    draftId,
    status: "sent",
    sentAt: new Date(),
  });
}

export async function processWebhookPayload(payload: Record<string, unknown>): Promise<void> {
  const mailbox = await ensurePrimaryMailbox();
  const eventType = typeof payload.type === "string" ? payload.type : "unknown";
  const eventId = typeof payload.id === "string" ? payload.id : undefined;
  const recorded = await recordWebhookEvent({
    mailboxId: mailbox.id,
    externalEventId: eventId,
    eventType,
    payload,
  });
  if (!recorded.inserted) {
    return;
  }

  try {
    if (eventType.startsWith("grant.")) {
      const grantId =
        typeof payload.grant_id === "string" ? payload.grant_id : mailbox.nylasGrantId;
      await updateMailboxConnection({
        mailboxId: mailbox.id,
        nylasGrantId: grantId ?? null,
        grantStatus:
          eventType === "grant.expired"
            ? "expired"
            : eventType === "grant.invalid"
              ? "invalid"
              : "connected",
        providerMetadata: payload,
      });
      await markWebhookEventProcessed(recorded.id);
      return;
    }

    if (!mailbox.nylasGrantId) {
      throw new Error("Mailbox grant is not connected.");
    }

    if (eventType.startsWith("message.") || eventType.startsWith("thread.")) {
      await syncMailboxThreads();
    }

    await markWebhookEventProcessed(recorded.id);
  } catch (error) {
    await markWebhookEventProcessed(
      recorded.id,
      error instanceof Error ? error.message : "Unknown webhook processing error"
    );
    throw error;
  }
}
