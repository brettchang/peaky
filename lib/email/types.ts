import type { Campaign, DashboardCampaign, DateRangeCapacity, PerformanceStats } from "@/lib/types";

export type EmailRecipient = {
  name?: string;
  email: string;
};

export type EmailParticipant = EmailRecipient & {
  role?: "from" | "to" | "cc" | "bcc";
};

export type EmailThreadStatus = "active" | "closed" | "archived";
export type EmailThreadResponseState =
  | "needs_review"
  | "draft_ready"
  | "approved"
  | "sent"
  | "no_reply_needed"
  | "syncing"
  | "error";

export type EmailDraftStatus =
  | "generated"
  | "edited"
  | "approved"
  | "sent"
  | "rejected"
  | "stale";

export type EmailAgentRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export type EmailCampaignLinkSource = "auto" | "manual";

export interface EmailMailboxRecord {
  id: string;
  provider: "nylas";
  emailAddress: string;
  displayName?: string;
  nylasGrantId?: string;
  nylasAccountId?: string;
  grantStatus: string;
  syncCursor?: string;
  lastWebhookCursor?: string;
  lastSyncedAt?: string;
  providerMetadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface EmailMessageRecord {
  id: string;
  threadId: string;
  mailboxId: string;
  nylasMessageId: string;
  direction: "inbound" | "outbound";
  subject: string;
  fromName?: string;
  fromEmail?: string;
  toRecipients: EmailRecipient[];
  ccRecipients: EmailRecipient[];
  bccRecipients: EmailRecipient[];
  participants: EmailParticipant[];
  sentAt?: string;
  bodyText?: string;
  bodyHtml?: string;
  snippet?: string;
}

export interface EmailThreadLink {
  id: string;
  threadId: string;
  campaignId: string;
  confidence: number;
  isPrimary: boolean;
  matchReason: string;
  source: EmailCampaignLinkSource;
  metadata?: Record<string, unknown>;
  campaign?: DashboardCampaign;
}

export interface EmailAgentExplanationStep {
  id: string;
  runId: string;
  stepType: string;
  title: string;
  content?: string;
  citations: string[];
  payload?: Record<string, unknown>;
  createdAt: string;
}

export interface EmailAgentRun {
  id: string;
  mailboxId: string;
  threadId: string;
  triggerMessageId?: string;
  status: EmailAgentRunStatus;
  model?: string;
  promptVersion?: string;
  knowledgeBaseHash?: string;
  knowledgeBasePath?: string;
  confidence?: number;
  rationaleSummary?: string;
  missingDataFlags: string[];
  safetyFlags: string[];
  toolCalls: Array<Record<string, unknown>>;
  rawResponse?: Record<string, unknown>;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  steps: EmailAgentExplanationStep[];
}

export interface EmailDraftRecord {
  id: string;
  mailboxId: string;
  threadId: string;
  runId?: string;
  nylasDraftId?: string;
  status: EmailDraftStatus;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  explanation?: string;
  explanationSummary?: string;
  explanationPayload?: Record<string, unknown>;
  isCurrent: boolean;
  approvedBy?: string;
  approvedAt?: string;
  sentAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmailThreadRecord {
  id: string;
  mailboxId: string;
  nylasThreadId: string;
  subject: string;
  snippet?: string;
  participants: EmailParticipant[];
  unread: boolean;
  inboundOnly: boolean;
  lastMessageAt?: string;
  latestMessageId?: string;
  status: EmailThreadStatus;
  responseState: EmailThreadResponseState;
  noReplyNeeded: boolean;
  needsAttention: boolean;
  lastAgentRunId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  messages: EmailMessageRecord[];
  links: EmailThreadLink[];
  currentDraft?: EmailDraftRecord;
  drafts: EmailDraftRecord[];
  latestRun?: EmailAgentRun;
}

export interface EmailCampaignSummary {
  campaign: Campaign;
  clientName: string;
  clientPortalId: string;
  portalUrl: string;
  billingPortalUrl?: string;
  latestStats?: PerformanceStats;
}

export interface EmailAgentContext {
  mailbox: EmailMailboxRecord;
  thread: EmailThreadRecord;
  linkedCampaigns: EmailCampaignSummary[];
  policyPrompt?: string;
  knowledgeBase: {
    markdown: string;
    hash: string;
    path: string;
  };
  /** When set, replaces the thread-based user prompt (e.g. for Slack-initiated drafts). */
  userInstruction?: string;
}

export interface EmailAgentToolResult {
  name: string;
  input: Record<string, unknown>;
  output: unknown;
}

export interface EmailAgentDraftResult {
  subject: string;
  bodyHtml: string;
  bodyText: string;
  explanationSummary: string;
  explanation: string;
  confidence: number;
  missingDataFlags: string[];
  safetyFlags: string[];
  toolCalls: EmailAgentToolResult[];
  steps: Array<{
    stepType: string;
    title: string;
    content?: string;
    citations?: string[];
    payload?: Record<string, unknown>;
  }>;
  rawResponse?: Record<string, unknown>;
}

// --- Pipeline types (multi-agent) ---

export interface CampaignResolution {
  campaignId: string;
  confidence: number;
  reasoning: string;
  matchSignals: string[];
}

export interface CampaignResolverResult {
  resolutions: CampaignResolution[];
  primaryCampaignId: string | null;
  noMatchReason?: string;
  rawResponse?: Record<string, unknown>;
}

export interface AssembledCampaignContext {
  campaignId: string;
  campaignName: string;
  clientName: string;
  status: string;
  portalUrl: string;
  billingPortalUrl?: string;
  onboarding: Record<string, unknown>;
  billing: Record<string, unknown>;
  placementStats: Record<string, unknown>;
  placements: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    scheduledDate?: string;
    copyProducer?: string;
  }>;
  adLineItems?: Array<Record<string, unknown>>;
}

export interface ContextAssemblerResult {
  threadSummary: string;
  clientIntent: string;
  actionNeeded: string;
  campaigns: AssembledCampaignContext[];
  constraints: string[];
  rawResponse?: Record<string, unknown>;
  toolCalls: EmailAgentToolResult[];
}

export interface EmailPipelineResult {
  resolverResult: CampaignResolverResult;
  assemblerResult: ContextAssemblerResult;
  draftResult: EmailAgentDraftResult;
}

export interface EmailThreadMatchCandidate {
  campaignId: string;
  confidence: number;
  matchReason: string;
  source: EmailCampaignLinkSource;
  metadata?: Record<string, unknown>;
}

export interface EmailThreadLinkInput extends EmailThreadMatchCandidate {
  isPrimary: boolean;
}

export interface EmailNylasThread {
  id: string;
  subject?: string;
  snippet?: string;
  participants?: EmailParticipant[];
  latestMessageReceivedDate?: number;
  unread?: boolean;
  messageIds?: string[];
  raw: Record<string, unknown>;
}

export interface EmailNylasMessage {
  id: string;
  threadId: string;
  subject?: string;
  from?: EmailRecipient[];
  to?: EmailRecipient[];
  cc?: EmailRecipient[];
  bcc?: EmailRecipient[];
  date?: number;
  body?: string;
  snippet?: string;
  unread?: boolean;
  folders?: string[];
  raw: Record<string, unknown>;
}

export interface EmailInboxPageData {
  mailbox?: EmailMailboxRecord;
  threads: EmailThreadRecord[];
  selectedThread?: EmailThreadRecord;
}

export interface EmailToolbox {
  findCampaignsByParticipant(email: string): Promise<EmailCampaignSummary[]>;
  getCampaignSummary(campaignId: string): Promise<EmailCampaignSummary | null>;
  getPortalUrls(campaignId: string): Promise<{ portalUrl: string; billingPortalUrl?: string } | null>;
  getOnboardingStatusAndLinks(campaignId: string): Promise<Record<string, unknown>>;
  getBillingOnboardingStatus(campaignId: string): Promise<Record<string, unknown>>;
  getScheduleCapacity(startDate: string, endDate: string): Promise<DateRangeCapacity>;
  getPlacementStats(campaignId: string): Promise<Record<string, PerformanceStats | undefined>>;
  getRecentClientHistory(email: string): Promise<EmailThreadRecord[]>;
}
