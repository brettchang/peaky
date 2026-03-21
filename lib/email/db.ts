import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { sql } from "@vercel/postgres";
import { db, getAllCampaignsWithClients, getCampaignById, getCapacityForDateRange, getSetting } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getPortalBaseUrl } from "@/lib/urls";
import type { DashboardCampaign, PerformanceStats } from "@/lib/types";
import { EMAIL_AGENT_POLICY_PROMPT_KEY } from "./constants";
import type {
  EmailAgentExplanationStep,
  EmailAgentRun,
  EmailCampaignSummary,
  EmailDraftRecord,
  EmailMailboxRecord,
  EmailMessageRecord,
  EmailParticipant,
  EmailRecipient,
  EmailThreadLink,
  EmailThreadLinkInput,
  EmailThreadRecord,
} from "./types";

function id(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function toIsoString(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function mapMailbox(row: typeof schema.mailboxes.$inferSelect): EmailMailboxRecord {
  return {
    id: row.id,
    provider: "nylas",
    emailAddress: row.emailAddress,
    displayName: row.displayName ?? undefined,
    nylasGrantId: row.nylasGrantId ?? undefined,
    nylasAccountId: row.nylasAccountId ?? undefined,
    grantStatus: row.grantStatus,
    syncCursor: row.syncCursor ?? undefined,
    lastWebhookCursor: row.lastWebhookCursor ?? undefined,
    lastSyncedAt: toIsoString(row.lastSyncedAt),
    providerMetadata: parseJson<Record<string, unknown> | undefined>(row.providerMetadata, undefined),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapRecipient(value: unknown): EmailRecipient[] {
  return parseJson<EmailRecipient[]>(value, []).filter((recipient) => recipient?.email);
}

function mapParticipants(value: unknown): EmailParticipant[] {
  return parseJson<EmailParticipant[]>(value, []).filter((participant) => participant?.email);
}

function mapMessage(row: typeof schema.emailMessages.$inferSelect): EmailMessageRecord {
  return {
    id: row.id,
    threadId: row.threadId,
    mailboxId: row.mailboxId,
    nylasMessageId: row.nylasMessageId,
    direction: row.direction as "inbound" | "outbound",
    subject: row.subject,
    fromName: row.fromName ?? undefined,
    fromEmail: row.fromEmail ?? undefined,
    toRecipients: mapRecipient(row.toRecipients),
    ccRecipients: mapRecipient(row.ccRecipients),
    bccRecipients: mapRecipient(row.bccRecipients),
    participants: mapParticipants(row.participants),
    sentAt: toIsoString(row.sentAt),
    bodyText: row.bodyText ?? undefined,
    bodyHtml: row.bodyHtml ?? undefined,
    snippet: row.snippet ?? undefined,
  };
}

function mapThreadLink(
  row: typeof schema.emailThreadCampaignLinks.$inferSelect,
  campaign?: DashboardCampaign
): EmailThreadLink {
  return {
    id: row.id,
    threadId: row.threadId,
    campaignId: row.campaignId,
    confidence: row.confidence,
    isPrimary: row.isPrimary,
    matchReason: row.matchReason,
    source: row.source as "auto" | "manual",
    metadata: parseJson<Record<string, unknown> | undefined>(row.metadata, undefined),
    campaign,
  };
}

function mapRunStep(row: typeof schema.emailAgentRunSteps.$inferSelect): EmailAgentExplanationStep {
  return {
    id: row.id,
    runId: row.runId,
    stepType: row.stepType,
    title: row.title,
    content: row.content ?? undefined,
    citations: parseJson<string[]>(row.citations, []),
    payload: parseJson<Record<string, unknown> | undefined>(row.payload, undefined),
    createdAt: row.createdAt.toISOString(),
  };
}

function mapRun(
  row: typeof schema.emailAgentRuns.$inferSelect,
  steps: EmailAgentExplanationStep[]
): EmailAgentRun {
  return {
    id: row.id,
    mailboxId: row.mailboxId,
    threadId: row.threadId,
    triggerMessageId: row.triggerMessageId ?? undefined,
    status: row.status as EmailAgentRun["status"],
    model: row.model ?? undefined,
    promptVersion: row.promptVersion ?? undefined,
    knowledgeBaseHash: row.knowledgeBaseHash ?? undefined,
    knowledgeBasePath: row.knowledgeBasePath ?? undefined,
    confidence: row.confidence ?? undefined,
    rationaleSummary: row.rationaleSummary ?? undefined,
    missingDataFlags: parseJson<string[]>(row.missingDataFlags, []),
    safetyFlags: parseJson<string[]>(row.safetyFlags, []),
    toolCalls: parseJson<Array<Record<string, unknown>>>(row.toolCalls, []),
    rawResponse: parseJson<Record<string, unknown> | undefined>(row.rawResponse, undefined),
    errorMessage: row.errorMessage ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: toIsoString(row.completedAt),
    steps,
  };
}

function mapDraft(row: typeof schema.emailDrafts.$inferSelect): EmailDraftRecord {
  return {
    id: row.id,
    mailboxId: row.mailboxId,
    threadId: row.threadId,
    runId: row.runId ?? undefined,
    nylasDraftId: row.nylasDraftId ?? undefined,
    status: row.status as EmailDraftRecord["status"],
    subject: row.subject,
    bodyHtml: row.bodyHtml,
    bodyText: row.bodyText ?? undefined,
    explanation: row.explanation ?? undefined,
    explanationSummary: row.explanationSummary ?? undefined,
    explanationPayload: parseJson<Record<string, unknown> | undefined>(
      row.explanationPayload,
      undefined
    ),
    isCurrent: row.isCurrent,
    approvedBy: row.approvedBy ?? undefined,
    approvedAt: toIsoString(row.approvedAt),
    sentAt: toIsoString(row.sentAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapThreadBase(row: typeof schema.emailThreads.$inferSelect): Omit<
  EmailThreadRecord,
  "messages" | "links" | "drafts" | "currentDraft" | "latestRun"
> {
  return {
    id: row.id,
    mailboxId: row.mailboxId,
    nylasThreadId: row.nylasThreadId,
    subject: row.subject,
    snippet: row.snippet ?? undefined,
    participants: mapParticipants(row.participants),
    unread: row.unread,
    inboundOnly: row.inboundOnly,
    lastMessageAt: toIsoString(row.lastMessageAt),
    latestMessageId: row.latestMessageId ?? undefined,
    status: row.status as EmailThreadRecord["status"],
    responseState: row.responseState as EmailThreadRecord["responseState"],
    noReplyNeeded: row.noReplyNeeded,
    needsAttention: row.needsAttention,
    lastAgentRunId: row.lastAgentRunId ?? undefined,
    metadata: parseJson<Record<string, unknown> | undefined>(row.metadata, undefined),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

let emailTablesEnsured = false;

export async function ensureEmailTables(): Promise<void> {
  if (emailTablesEnsured) return;

  await sql`
    create table if not exists mailboxes (
      id text primary key,
      provider text not null default 'nylas',
      email_address text not null,
      display_name text,
      nylas_grant_id text,
      nylas_account_id text,
      grant_status text not null default 'disconnected',
      sync_cursor text,
      last_webhook_cursor text,
      last_synced_at timestamptz,
      provider_metadata jsonb,
      created_at timestamptz not null,
      updated_at timestamptz not null
    )
  `;
  await sql`create unique index if not exists mailboxes_email_address_idx on mailboxes (email_address)`;
  await sql`create unique index if not exists mailboxes_nylas_grant_id_idx on mailboxes (nylas_grant_id)`;

  await sql`
    create table if not exists email_threads (
      id text primary key,
      mailbox_id text not null references mailboxes(id) on delete cascade,
      nylas_thread_id text not null,
      subject text not null default '',
      snippet text,
      participants jsonb,
      unread boolean not null default true,
      inbound_only boolean not null default false,
      last_message_at timestamptz,
      latest_message_id text,
      status text not null default 'active',
      response_state text not null default 'needs_review',
      no_reply_needed boolean not null default false,
      needs_attention boolean not null default true,
      last_agent_run_id text,
      metadata jsonb,
      created_at timestamptz not null,
      updated_at timestamptz not null
    )
  `;
  await sql`create unique index if not exists email_threads_mailbox_thread_idx on email_threads (mailbox_id, nylas_thread_id)`;
  await sql`create index if not exists email_threads_mailbox_updated_idx on email_threads (mailbox_id, updated_at)`;
  await sql`create index if not exists email_threads_response_state_idx on email_threads (response_state)`;

  await sql`
    create table if not exists email_messages (
      id text primary key,
      thread_id text not null references email_threads(id) on delete cascade,
      mailbox_id text not null references mailboxes(id) on delete cascade,
      nylas_message_id text not null,
      direction text not null,
      subject text not null default '',
      from_name text,
      from_email text,
      to_recipients jsonb,
      cc_recipients jsonb,
      bcc_recipients jsonb,
      participants jsonb,
      sent_at timestamptz,
      body_text text,
      body_html text,
      snippet text,
      raw_payload jsonb,
      created_at timestamptz not null,
      updated_at timestamptz not null
    )
  `;
  await sql`create unique index if not exists email_messages_nylas_message_id_idx on email_messages (nylas_message_id)`;
  await sql`create index if not exists email_messages_thread_sent_at_idx on email_messages (thread_id, sent_at)`;

  await sql`
    create table if not exists email_thread_campaign_links (
      id text primary key,
      thread_id text not null references email_threads(id) on delete cascade,
      campaign_id text not null references campaigns(id) on delete cascade,
      confidence integer not null default 0,
      is_primary boolean not null default false,
      match_reason text not null,
      source text not null default 'auto',
      metadata jsonb,
      created_at timestamptz not null,
      updated_at timestamptz not null
    )
  `;
  await sql`create unique index if not exists email_thread_campaign_links_unique_idx on email_thread_campaign_links (thread_id, campaign_id)`;
  await sql`create index if not exists email_thread_campaign_links_campaign_idx on email_thread_campaign_links (campaign_id)`;

  await sql`
    create table if not exists email_agent_runs (
      id text primary key,
      mailbox_id text not null references mailboxes(id) on delete cascade,
      thread_id text not null references email_threads(id) on delete cascade,
      trigger_message_id text,
      status text not null default 'pending',
      model text,
      prompt_version text,
      knowledge_base_hash text,
      knowledge_base_path text,
      confidence integer,
      rationale_summary text,
      missing_data_flags jsonb,
      safety_flags jsonb,
      tool_calls jsonb,
      raw_response jsonb,
      error_message text,
      created_at timestamptz not null,
      updated_at timestamptz not null,
      completed_at timestamptz
    )
  `;
  await sql`alter table email_agent_runs add column if not exists mailbox_id text`;
  await sql`alter table email_agent_runs add column if not exists message_id text`;
  await sql`alter table email_agent_runs add column if not exists sender_email text`;
  await sql`alter table email_agent_runs add column if not exists sender_name text`;
  await sql`alter table email_agent_runs add column if not exists matched_campaign_names jsonb`;
  await sql`alter table email_agent_runs add column if not exists inbound_thread jsonb`;
  await sql`alter table email_agent_runs add column if not exists matched_campaigns jsonb`;
  await sql`alter table email_agent_runs add column if not exists draft_subject text`;
  await sql`alter table email_agent_runs add column if not exists draft_body text`;
  await sql`alter table email_agent_runs add column if not exists prompt_trace jsonb`;
  await sql`alter table email_agent_runs add column if not exists raw_response_text text`;
  await sql`alter table email_agent_runs add column if not exists gmail_draft_id text`;
  await sql`alter table email_agent_runs add column if not exists review_status text`;
  await sql`alter table email_agent_runs add column if not exists review_notes text`;
  await sql`alter table email_agent_runs add column if not exists trigger_message_id text`;
  await sql`alter table email_agent_runs add column if not exists model text`;
  await sql`alter table email_agent_runs add column if not exists prompt_version text`;
  await sql`alter table email_agent_runs add column if not exists knowledge_base_hash text`;
  await sql`alter table email_agent_runs add column if not exists knowledge_base_path text`;
  await sql`alter table email_agent_runs add column if not exists confidence integer`;
  await sql`alter table email_agent_runs add column if not exists rationale_summary text`;
  await sql`alter table email_agent_runs add column if not exists missing_data_flags jsonb`;
  await sql`alter table email_agent_runs add column if not exists safety_flags jsonb`;
  await sql`alter table email_agent_runs add column if not exists tool_calls jsonb`;
  await sql`alter table email_agent_runs add column if not exists raw_response jsonb`;
  await sql`alter table email_agent_runs add column if not exists completed_at timestamptz`;
  await sql`alter table email_agent_runs alter column message_id drop not null`;
  await sql`alter table email_agent_runs alter column sender_email drop not null`;
  await sql`alter table email_agent_runs alter column sender_name set default ''`;
  await sql`alter table email_agent_runs alter column subject set default ''`;
  await sql`alter table email_agent_runs alter column review_status set default 'pending'`;
  await sql`alter table email_agent_runs alter column matched_campaign_names set default '[]'::jsonb`;
  await sql`alter table email_agent_runs alter column inbound_thread set default '{}'::jsonb`;
  await sql`alter table email_agent_runs alter column matched_campaigns set default '[]'::jsonb`;
  await sql`alter table email_agent_runs alter column tool_calls set default '[]'::jsonb`;
  await sql`create index if not exists email_agent_runs_thread_created_idx on email_agent_runs (thread_id, created_at)`;
  await sql`create index if not exists email_agent_runs_status_idx on email_agent_runs (status)`;

  await sql`
    create table if not exists email_agent_run_steps (
      id text primary key,
      run_id text not null references email_agent_runs(id) on delete cascade,
      step_type text not null,
      title text not null,
      content text,
      citations jsonb,
      payload jsonb,
      created_at timestamptz not null
    )
  `;
  await sql`create index if not exists email_agent_run_steps_run_idx on email_agent_run_steps (run_id, created_at)`;

  await sql`
    create table if not exists email_drafts (
      id text primary key,
      mailbox_id text not null references mailboxes(id) on delete cascade,
      thread_id text not null references email_threads(id) on delete cascade,
      run_id text references email_agent_runs(id) on delete set null,
      nylas_draft_id text,
      status text not null default 'generated',
      subject text not null default '',
      body_html text not null default '',
      body_text text,
      explanation text,
      explanation_summary text,
      explanation_payload jsonb,
      is_current boolean not null default true,
      approved_by text,
      approved_at timestamptz,
      sent_at timestamptz,
      metadata jsonb,
      created_at timestamptz not null,
      updated_at timestamptz not null
    )
  `;
  await sql`create index if not exists email_drafts_thread_current_idx on email_drafts (thread_id, is_current)`;
  await sql`create index if not exists email_drafts_status_idx on email_drafts (status)`;

  await sql`
    create table if not exists email_webhook_events (
      id text primary key,
      mailbox_id text references mailboxes(id) on delete set null,
      external_event_id text,
      event_type text not null,
      payload jsonb,
      processed_at timestamptz,
      processing_error text,
      created_at timestamptz not null
    )
  `;
  await sql`create unique index if not exists email_webhook_events_external_event_idx on email_webhook_events (external_event_id)`;
  await sql`create index if not exists email_webhook_events_type_idx on email_webhook_events (event_type, created_at)`;

  emailTablesEnsured = true;
}

export async function ensureMailbox(input: {
  id: string;
  emailAddress: string;
  displayName?: string;
}): Promise<EmailMailboxRecord> {
  await ensureEmailTables();
  const now = new Date();
  await db
    .insert(schema.mailboxes)
    .values({
      id: input.id,
      emailAddress: input.emailAddress.toLowerCase(),
      displayName: input.displayName ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.mailboxes.emailAddress,
      set: {
        displayName: input.displayName ?? null,
        updatedAt: now,
      },
    });

  const row = await db.query.mailboxes.findFirst({
    where: eq(schema.mailboxes.emailAddress, input.emailAddress.toLowerCase()),
  });
  if (!row) throw new Error("Failed to ensure mailbox.");
  return mapMailbox(row);
}

export async function getMailboxByEmail(emailAddress: string): Promise<EmailMailboxRecord | undefined> {
  const row = await db.query.mailboxes.findFirst({
    where: eq(schema.mailboxes.emailAddress, emailAddress.toLowerCase()),
  });
  return row ? mapMailbox(row) : undefined;
}

export async function updateMailboxConnection(input: {
  mailboxId: string;
  nylasGrantId?: string | null;
  nylasAccountId?: string | null;
  grantStatus: string;
  providerMetadata?: Record<string, unknown>;
  syncCursor?: string | null;
  lastWebhookCursor?: string | null;
}): Promise<void> {
  await db
    .update(schema.mailboxes)
    .set({
      nylasGrantId: input.nylasGrantId ?? null,
      nylasAccountId: input.nylasAccountId ?? null,
      grantStatus: input.grantStatus,
      providerMetadata: input.providerMetadata ?? null,
      syncCursor: input.syncCursor ?? null,
      lastWebhookCursor: input.lastWebhookCursor ?? null,
      updatedAt: new Date(),
    })
    .where(eq(schema.mailboxes.id, input.mailboxId));
}

export async function touchMailboxSync(mailboxId: string, cursor?: string | null): Promise<void> {
  await db
    .update(schema.mailboxes)
    .set({
      syncCursor: cursor ?? null,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.mailboxes.id, mailboxId));
}

export async function recordWebhookEvent(input: {
  mailboxId?: string;
  externalEventId?: string;
  eventType: string;
  payload: Record<string, unknown>;
}): Promise<{ inserted: boolean; id: string }> {
  const eventId = id("ewh");
  try {
    await db.insert(schema.emailWebhookEvents).values({
      id: eventId,
      mailboxId: input.mailboxId ?? null,
      externalEventId: input.externalEventId ?? null,
      eventType: input.eventType,
      payload: input.payload,
      createdAt: new Date(),
    });
    return { inserted: true, id: eventId };
  } catch {
    const existing = input.externalEventId
      ? await db.query.emailWebhookEvents.findFirst({
          where: eq(schema.emailWebhookEvents.externalEventId, input.externalEventId),
        })
      : null;
    return { inserted: false, id: existing?.id ?? eventId };
  }
}

export async function markWebhookEventProcessed(
  id: string,
  processingError?: string
): Promise<void> {
  await db
    .update(schema.emailWebhookEvents)
    .set({
      processedAt: new Date(),
      processingError: processingError ?? null,
    })
    .where(eq(schema.emailWebhookEvents.id, id));
}

export async function upsertThread(input: {
  mailboxId: string;
  nylasThreadId: string;
  subject: string;
  snippet?: string;
  participants: EmailParticipant[];
  unread: boolean;
  inboundOnly: boolean;
  lastMessageAt?: Date;
  latestMessageId?: string;
  metadata?: Record<string, unknown>;
}): Promise<EmailThreadRecord> {
  const now = new Date();
  const existing = await db.query.emailThreads.findFirst({
    where: and(
      eq(schema.emailThreads.mailboxId, input.mailboxId),
      eq(schema.emailThreads.nylasThreadId, input.nylasThreadId)
    ),
  });
  const threadId = existing?.id ?? id("eth");

  if (existing) {
    await db
      .update(schema.emailThreads)
      .set({
        subject: input.subject,
        snippet: input.snippet ?? null,
        participants: input.participants,
        unread: input.unread,
        inboundOnly: input.inboundOnly,
        lastMessageAt: input.lastMessageAt ?? null,
        latestMessageId: input.latestMessageId ?? null,
        metadata: input.metadata ?? null,
        noReplyNeeded: false,
        needsAttention: true,
        updatedAt: now,
      })
      .where(eq(schema.emailThreads.id, threadId));
  } else {
    await db.insert(schema.emailThreads).values({
      id: threadId,
      mailboxId: input.mailboxId,
      nylasThreadId: input.nylasThreadId,
      subject: input.subject,
      snippet: input.snippet ?? null,
      participants: input.participants,
      unread: input.unread,
      inboundOnly: input.inboundOnly,
      lastMessageAt: input.lastMessageAt ?? null,
      latestMessageId: input.latestMessageId ?? null,
      metadata: input.metadata ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  const row = await db.query.emailThreads.findFirst({
    where: eq(schema.emailThreads.id, threadId),
  });
  if (!row) throw new Error("Failed to upsert email thread.");
  return {
    ...mapThreadBase(row),
    messages: [],
    links: [],
    drafts: [],
  };
}

export async function upsertMessage(input: {
  mailboxId: string;
  threadId: string;
  nylasMessageId: string;
  direction: "inbound" | "outbound";
  subject: string;
  fromName?: string;
  fromEmail?: string;
  toRecipients: EmailRecipient[];
  ccRecipients?: EmailRecipient[];
  bccRecipients?: EmailRecipient[];
  participants: EmailParticipant[];
  sentAt?: Date;
  bodyText?: string;
  bodyHtml?: string;
  snippet?: string;
  rawPayload?: Record<string, unknown>;
}): Promise<EmailMessageRecord> {
  const now = new Date();
  const existing = await db.query.emailMessages.findFirst({
    where: eq(schema.emailMessages.nylasMessageId, input.nylasMessageId),
  });
  const values = {
    threadId: input.threadId,
    mailboxId: input.mailboxId,
    nylasMessageId: input.nylasMessageId,
    direction: input.direction,
    subject: input.subject,
    fromName: input.fromName ?? null,
    fromEmail: input.fromEmail?.toLowerCase() ?? null,
    toRecipients: input.toRecipients,
    ccRecipients: input.ccRecipients ?? [],
    bccRecipients: input.bccRecipients ?? [],
    participants: input.participants,
    sentAt: input.sentAt ?? null,
    bodyText: input.bodyText ?? null,
    bodyHtml: input.bodyHtml ?? null,
    snippet: input.snippet ?? null,
    rawPayload: input.rawPayload ?? null,
    updatedAt: now,
  };

  if (existing) {
    await db
      .update(schema.emailMessages)
      .set(values)
      .where(eq(schema.emailMessages.id, existing.id));
    return mapMessage({
      ...existing,
      ...values,
    } as typeof schema.emailMessages.$inferSelect);
  }

  const messageId = id("emsg");
  await db.insert(schema.emailMessages).values({
    id: messageId,
    ...values,
    createdAt: now,
  });
  const row = await db.query.emailMessages.findFirst({
    where: eq(schema.emailMessages.id, messageId),
  });
  if (!row) throw new Error("Failed to create email message.");
  return mapMessage(row);
}

export async function replaceThreadLinks(
  threadId: string,
  links: EmailThreadLinkInput[]
): Promise<void> {
  await db.delete(schema.emailThreadCampaignLinks).where(eq(schema.emailThreadCampaignLinks.threadId, threadId));
  if (links.length === 0) return;
  const now = new Date();
  await db.insert(schema.emailThreadCampaignLinks).values(
    links.map((link) => ({
      id: id("elink"),
      threadId,
      campaignId: link.campaignId,
      confidence: link.confidence,
      isPrimary: link.isPrimary,
      matchReason: link.matchReason,
      source: link.source,
      metadata: link.metadata ?? null,
      createdAt: now,
      updatedAt: now,
    }))
  );
}

export async function createAgentRun(input: {
  mailboxId: string;
  threadId: string;
  triggerMessageId?: string;
  model?: string;
  promptVersion?: string;
  knowledgeBaseHash?: string;
  knowledgeBasePath?: string;
}): Promise<string> {
  const runId = id("ear");
  const now = new Date();
  await db.insert(schema.emailAgentRuns).values({
    id: runId,
    mailboxId: input.mailboxId,
    threadId: input.threadId,
    triggerMessageId: input.triggerMessageId ?? null,
    status: "running",
    model: input.model ?? null,
    promptVersion: input.promptVersion ?? null,
    knowledgeBaseHash: input.knowledgeBaseHash ?? null,
    knowledgeBasePath: input.knowledgeBasePath ?? null,
    createdAt: now,
    updatedAt: now,
  });
  await db
    .update(schema.emailThreads)
    .set({
      lastAgentRunId: runId,
      responseState: "syncing",
      updatedAt: now,
    })
    .where(eq(schema.emailThreads.id, input.threadId));
  return runId;
}

export async function completeAgentRun(input: {
  runId: string;
  status: EmailAgentRun["status"];
  confidence?: number;
  rationaleSummary?: string;
  missingDataFlags?: string[];
  safetyFlags?: string[];
  toolCalls?: Array<Record<string, unknown>>;
  rawResponse?: Record<string, unknown>;
  errorMessage?: string;
  steps?: Array<{
    stepType: string;
    title: string;
    content?: string;
    citations?: string[];
    payload?: Record<string, unknown>;
  }>;
}): Promise<void> {
  const now = new Date();
  await db
    .update(schema.emailAgentRuns)
    .set({
      status: input.status,
      confidence: input.confidence ?? null,
      rationaleSummary: input.rationaleSummary ?? null,
      missingDataFlags: input.missingDataFlags ?? [],
      safetyFlags: input.safetyFlags ?? [],
      toolCalls: input.toolCalls ?? [],
      rawResponse: input.rawResponse ?? null,
      errorMessage: input.errorMessage ?? null,
      updatedAt: now,
      completedAt: now,
    })
    .where(eq(schema.emailAgentRuns.id, input.runId));

  if (input.steps?.length) {
    await db.delete(schema.emailAgentRunSteps).where(eq(schema.emailAgentRunSteps.runId, input.runId));
    await db.insert(schema.emailAgentRunSteps).values(
      input.steps.map((step) => ({
        id: id("eas"),
        runId: input.runId,
        stepType: step.stepType,
        title: step.title,
        content: step.content ?? null,
        citations: step.citations ?? [],
        payload: step.payload ?? null,
        createdAt: now,
      }))
    );
  }
}

export async function markThreadAgentError(threadId: string): Promise<void> {
  await db
    .update(schema.emailThreads)
    .set({
      responseState: "error",
      needsAttention: true,
      updatedAt: new Date(),
    })
    .where(eq(schema.emailThreads.id, threadId));
}

export async function invalidateCurrentDrafts(threadId: string): Promise<void> {
  await db
    .update(schema.emailDrafts)
    .set({
      status: "stale",
      isCurrent: false,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.emailDrafts.threadId, threadId), eq(schema.emailDrafts.isCurrent, true)));
}

export async function createDraft(input: {
  mailboxId: string;
  threadId: string;
  runId?: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  explanation?: string;
  explanationSummary?: string;
  explanationPayload?: Record<string, unknown>;
  nylasDraftId?: string;
}): Promise<EmailDraftRecord> {
  await invalidateCurrentDrafts(input.threadId);
  const now = new Date();
  const draftId = id("edr");
  await db.insert(schema.emailDrafts).values({
    id: draftId,
    mailboxId: input.mailboxId,
    threadId: input.threadId,
    runId: input.runId ?? null,
    nylasDraftId: input.nylasDraftId ?? null,
    status: "generated",
    subject: input.subject,
    bodyHtml: input.bodyHtml,
    bodyText: input.bodyText ?? null,
    explanation: input.explanation ?? null,
    explanationSummary: input.explanationSummary ?? null,
    explanationPayload: input.explanationPayload ?? null,
    isCurrent: true,
    createdAt: now,
    updatedAt: now,
  });
  await db
    .update(schema.emailThreads)
    .set({
      responseState: "draft_ready",
      needsAttention: true,
      updatedAt: now,
    })
    .where(eq(schema.emailThreads.id, input.threadId));
  const row = await db.query.emailDrafts.findFirst({
    where: eq(schema.emailDrafts.id, draftId),
  });
  if (!row) throw new Error("Failed to create email draft.");
  return mapDraft(row);
}

export async function updateDraft(input: {
  draftId: string;
  status?: EmailDraftRecord["status"];
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  approvedBy?: string | null;
  nylasDraftId?: string | null;
  sentAt?: Date | null;
}): Promise<void> {
  const now = new Date();
  const current = await db.query.emailDrafts.findFirst({
    where: eq(schema.emailDrafts.id, input.draftId),
  });
  if (!current) throw new Error("Draft not found.");

  await db
    .update(schema.emailDrafts)
    .set({
      status:
        input.status ??
        (input.subject || input.bodyHtml || input.bodyText ? "edited" : current.status),
      subject: input.subject ?? current.subject,
      bodyHtml: input.bodyHtml ?? current.bodyHtml,
      bodyText: input.bodyText ?? current.bodyText,
      approvedBy:
        input.status === "approved" ? input.approvedBy ?? "portal-reviewer" : current.approvedBy,
      approvedAt:
        input.status === "approved" ? now : input.status === "rejected" ? null : current.approvedAt,
      nylasDraftId: input.nylasDraftId ?? current.nylasDraftId,
      sentAt: input.sentAt ?? current.sentAt,
      updatedAt: now,
    })
    .where(eq(schema.emailDrafts.id, input.draftId));

  const nextResponseState =
    input.status === "approved"
      ? "approved"
      : input.status === "sent"
        ? "sent"
        : input.status === "rejected"
          ? "needs_review"
          : "draft_ready";

  await db
    .update(schema.emailThreads)
    .set({
      responseState: nextResponseState,
      noReplyNeeded: false,
      updatedAt: now,
    })
    .where(eq(schema.emailThreads.id, current.threadId));
}

export async function setThreadNoReplyNeeded(threadId: string, noReplyNeeded: boolean): Promise<void> {
  await db
    .update(schema.emailThreads)
    .set({
      noReplyNeeded,
      responseState: noReplyNeeded ? "no_reply_needed" : "needs_review",
      needsAttention: !noReplyNeeded,
      updatedAt: new Date(),
    })
    .where(eq(schema.emailThreads.id, threadId));
}

export async function getThreadById(threadId: string): Promise<EmailThreadRecord | undefined> {
  const threadRow = await db.query.emailThreads.findFirst({
    where: eq(schema.emailThreads.id, threadId),
  });
  if (!threadRow) return undefined;

  const [messageRows, linkRows, draftRows, runRows, campaignRows] = await Promise.all([
    db.query.emailMessages.findMany({
      where: eq(schema.emailMessages.threadId, threadId),
      orderBy: [schema.emailMessages.sentAt],
    }),
    db.query.emailThreadCampaignLinks.findMany({
      where: eq(schema.emailThreadCampaignLinks.threadId, threadId),
    }),
    db.query.emailDrafts.findMany({
      where: eq(schema.emailDrafts.threadId, threadId),
      orderBy: [desc(schema.emailDrafts.createdAt)],
    }),
    db.query.emailAgentRuns.findMany({
      where: eq(schema.emailAgentRuns.threadId, threadId),
      orderBy: [desc(schema.emailAgentRuns.createdAt)],
      limit: 1,
    }),
    getAllCampaignsWithClients(),
  ]);

  const run = runRows[0];
  const steps = run
    ? await db.query.emailAgentRunSteps.findMany({
        where: eq(schema.emailAgentRunSteps.runId, run.id),
        orderBy: [schema.emailAgentRunSteps.createdAt],
      })
    : [];
  const campaignsById = new Map(campaignRows.map((row) => [row.campaign.id, row]));

  return {
    ...mapThreadBase(threadRow),
    messages: messageRows.map(mapMessage),
    links: linkRows.map((row) => mapThreadLink(row, campaignsById.get(row.campaignId))),
    drafts: draftRows.map(mapDraft),
    currentDraft: draftRows.find((draft) => draft.isCurrent)
      ? mapDraft(draftRows.find((draft) => draft.isCurrent) as typeof schema.emailDrafts.$inferSelect)
      : undefined,
    latestRun: run ? mapRun(run, steps.map(mapRunStep)) : undefined,
  };
}

export async function listThreads(mailboxId: string): Promise<EmailThreadRecord[]> {
  const rows = await db.query.emailThreads.findMany({
    where: eq(schema.emailThreads.mailboxId, mailboxId),
    orderBy: [desc(schema.emailThreads.lastMessageAt), desc(schema.emailThreads.updatedAt)],
  });
  return Promise.all(
    rows.map(async (row) => {
      const thread = await getThreadById(row.id);
      if (!thread) {
        return {
          ...mapThreadBase(row),
          messages: [],
          links: [],
          drafts: [],
        };
      }
      return thread;
    })
  );
}

export async function getRecentClientHistory(email: string): Promise<EmailThreadRecord[]> {
  const lowered = email.toLowerCase();
  const rows = await db.query.emailMessages.findMany({
    where: eq(schema.emailMessages.fromEmail, lowered),
    orderBy: [desc(schema.emailMessages.sentAt)],
    limit: 10,
  });
  const threadIds = Array.from(new Set(rows.map((row) => row.threadId)));
  const threads = await Promise.all(threadIds.map((threadId) => getThreadById(threadId)));
  return threads.filter(Boolean) as EmailThreadRecord[];
}

export async function getEmailPolicyPrompt(): Promise<string | undefined> {
  const value = await getSetting(EMAIL_AGENT_POLICY_PROMPT_KEY);
  return value?.trim() || undefined;
}

export async function buildCampaignSummary(campaignId: string): Promise<EmailCampaignSummary | null> {
  const all = await getAllCampaignsWithClients();
  const matched = all.find((entry) => entry.campaign.id === campaignId);
  if (!matched) return null;
  const campaign = matched.campaign;
  const portalUrl = `${getPortalBaseUrl()}/portal/${matched.clientPortalId}`;
  const billingPortalUrl =
    campaign.billingOnboarding && !campaign.complementaryCampaign && campaign.category !== "Evergreen"
      ? `${portalUrl}/${campaign.id}/form/billing`
      : undefined;
  const latestStats = campaign.placements.reduce<PerformanceStats | undefined>((current, placement) => {
    if (!placement.stats) return current;
    return placement.stats;
  }, undefined);

  return {
    campaign,
    clientName: matched.clientName,
    clientPortalId: matched.clientPortalId,
    portalUrl,
    billingPortalUrl,
    latestStats,
  };
}

export async function getCampaignSummaries(campaignIds: string[]): Promise<EmailCampaignSummary[]> {
  const summaries = await Promise.all(campaignIds.map((campaignId) => buildCampaignSummary(campaignId)));
  return summaries.filter(Boolean) as EmailCampaignSummary[];
}

export async function getCampaignSummaryForThread(threadId: string): Promise<EmailCampaignSummary[]> {
  const links = await db.query.emailThreadCampaignLinks.findMany({
    where: eq(schema.emailThreadCampaignLinks.threadId, threadId),
  });
  return getCampaignSummaries(links.map((link) => link.campaignId));
}

export async function getCampaignLookup(): Promise<DashboardCampaign[]> {
  return getAllCampaignsWithClients();
}

export async function getCampaignContextTools(campaignId: string): Promise<{
  summary: EmailCampaignSummary | null;
  onboarding: Record<string, unknown>;
  billing: Record<string, unknown>;
  placementStats: Record<string, PerformanceStats | undefined>;
}> {
  const summary = await buildCampaignSummary(campaignId);
  const campaign = await getCampaignById(campaignId);
  if (!campaign || !summary) {
    return {
      summary,
      onboarding: {},
      billing: {},
      placementStats: {},
    };
  }
  return {
    summary,
    onboarding: {
      submittedAt: campaign.onboardingSubmittedAt,
      rounds: campaign.onboardingRounds.map((round) => ({
        id: round.id,
        label: round.label,
        formType: round.formType,
        complete: round.complete,
        formLink: round.formLink,
        onboardingDocUrl: round.onboardingDocUrl,
      })),
      legacyOnboardingDocUrl: campaign.legacyOnboardingDocUrl,
    },
    billing: campaign.billingOnboarding
      ? {
          complete: campaign.billingOnboarding.complete,
          completedAt: campaign.billingOnboarding.completedAt,
          formLink: campaign.billingOnboarding.formLink,
          billingContactName: campaign.billingOnboarding.billingContactName,
          billingContactEmail: campaign.billingOnboarding.billingContactEmail,
          ioSigningContactName: campaign.billingOnboarding.ioSigningContactName,
          ioSigningContactEmail: campaign.billingOnboarding.ioSigningContactEmail,
        }
      : {},
    placementStats: Object.fromEntries(
      campaign.placements.map((placement) => [placement.id, placement.stats])
    ),
  };
}

export async function getCapacitySnapshot(startDate: string, endDate: string) {
  return getCapacityForDateRange(startDate, endDate);
}

export async function findCampaignsForEmail(email: string): Promise<EmailCampaignSummary[]> {
  const lowered = email.trim().toLowerCase();
  const campaigns = await getAllCampaignsWithClients();
  const matches = campaigns.filter((entry) => {
    const campaign = entry.campaign;
    const candidates = [
      campaign.contactEmail,
      ...(campaign.contacts?.map((contact) => contact.email) ?? []),
      campaign.billingOnboarding?.billingContactEmail,
      campaign.billingOnboarding?.ioSigningContactEmail,
    ]
      .filter(Boolean)
      .map((value) => value?.toLowerCase());
    return candidates.includes(lowered);
  });
  return Promise.all(
    matches.map(async (entry) => {
      const summary = await buildCampaignSummary(entry.campaign.id);
      return summary as EmailCampaignSummary;
    })
  );
}

export async function getThreadsByIds(threadIds: string[]): Promise<EmailThreadRecord[]> {
  if (threadIds.length === 0) return [];
  const rows = await db.query.emailThreads.findMany({
    where: inArray(schema.emailThreads.id, threadIds),
    orderBy: [desc(schema.emailThreads.updatedAt)],
  });
  const mapped = await Promise.all(rows.map((row) => getThreadById(row.id)));
  return mapped.filter(Boolean) as EmailThreadRecord[];
}

/**
 * Returns recent email threads that have NO campaign link.
 * These are threads that need to be associated with a campaign in the portal.
 */
export async function getUnlinkedThreads(
  limit: number = 20,
  sinceDays: number = 14
): Promise<
  Array<{
    threadId: string;
    subject: string | null;
    snippet: string | null;
    participants: EmailParticipant[] | null;
    lastMessageAt: string | undefined;
  }>
> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - sinceDays);

  // Get all threads, then filter out those with campaign links
  const allThreads = await db.query.emailThreads.findMany({
    orderBy: [desc(schema.emailThreads.lastMessageAt)],
    with: {
      campaignLinks: true,
    },
  });

  return allThreads
    .filter((t) => {
      // No campaign links
      if (t.campaignLinks && t.campaignLinks.length > 0) return false;
      // Within date window
      const lastMsg = t.lastMessageAt ?? t.updatedAt;
      if (!lastMsg) return false;
      return new Date(lastMsg) >= cutoff;
    })
    .slice(0, limit)
    .map((t) => ({
      threadId: t.id,
      subject: t.subject,
      snippet: t.snippet,
      participants: t.participants as EmailParticipant[] | null,
      lastMessageAt: toIsoString(t.lastMessageAt),
    }));
}
