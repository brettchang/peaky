import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import type { AdLineItem, PerformanceStats, InvoiceCadence } from "../types";

// ─── Clients ─────────────────────────────────────────────────

export const clients = pgTable(
  "clients",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    portalId: text("portal_id").notNull(),
  },
  (t) => [uniqueIndex("clients_portal_id_idx").on(t.portalId)]
);

export const clientsRelations = relations(clients, ({ many }) => ({
  campaigns: many(campaigns),
}));

// ─── Campaigns ───────────────────────────────────────────────

export const campaigns = pgTable(
  "campaigns",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    portalId: text("portal_id").notNull(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id),
    category: text("category").notNull().default("Standard"),
    status: text("status").notNull(), // CampaignStatus union
    campaignManager: text("campaign_manager").notNull(),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    currency: text("currency").notNull().default("CAD"),
    taxEligible: boolean("tax_eligible").notNull().default(true),
    adLineItems: jsonb("ad_line_items").$type<AdLineItem[]>(),
    placementsDescription: text("placements_description"),
    performanceTableUrl: text("performance_table_url"),
    notes: text("notes"),
    onboardingCampaignObjective: text("onboarding_campaign_objective"),
    onboardingKeyMessage: text("onboarding_key_message"),
    onboardingTalkingPoints: text("onboarding_talking_points"),
    onboardingCallToAction: text("onboarding_call_to_action"),
    onboardingTargetAudience: text("onboarding_target_audience"),
    onboardingToneGuidelines: text("onboarding_tone_guidelines"),
    onboardingSubmittedAt: timestamp("onboarding_submitted_at", { withTimezone: true }),
    legacyOnboardingDocUrl: text("legacy_onboarding_doc_url"),
    pandadocDocumentId: text("pandadoc_document_id"),
    pandadocStatus: text("pandadoc_status"),
    pandadocDocumentUrl: text("pandadoc_document_url"),
    pandadocCreatedAt: timestamp("pandadoc_created_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("campaigns_portal_id_idx").on(t.portalId),
    index("campaigns_client_id_idx").on(t.clientId),
    check(
      "campaigns_campaign_manager_chk",
      sql`${t.campaignManager} in ('Matheus', 'Brett', 'Will')`
    ),
  ]
);

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  client: one(clients, {
    fields: [campaigns.clientId],
    references: [clients.id],
  }),
  placements: many(placements),
  onboardingRounds: many(onboardingRounds),
  billingOnboarding: one(billingOnboarding),
  campaignInvoices: many(campaignInvoices),
  campaignManagerNotes: many(campaignManagerNotes),
}));

// ─── Placements ──────────────────────────────────────────────

export const placements = pgTable(
  "placements",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull(), // PlacementType union
    publication: text("publication").notNull(), // Publication union
    scheduledDate: text("scheduled_date"), // stored as YYYY-MM-DD string
    status: text("status").notNull(), // PlacementStatus union
    currentCopy: text("current_copy").notNull().default(""),
    copyVersion: integer("copy_version").notNull().default(0),
    revisionNotes: text("revision_notes"),
    onboardingRoundId: text("onboarding_round_id"),
    copyProducer: text("copy_producer"), // "Us" | "Client"
    notes: text("notes"),
    onboardingBrief: text("onboarding_brief"),
    stats: jsonb("stats").$type<PerformanceStats>(),
    imageUrl: text("image_url"),
    logoUrl: text("logo_url"),
    linkToPlacement: text("link_to_placement"),
    conflictPreference: text("conflict_preference"), // "Defer if conflict" | "Date is crucial"
    beehiivPostId: text("beehiiv_post_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [index("placements_campaign_id_idx").on(t.campaignId)]
);

export const placementsRelations = relations(placements, ({ one, many }) => ({
  campaign: one(campaigns, {
    fields: [placements.campaignId],
    references: [campaigns.id],
  }),
  revisionHistory: many(copyVersions),
  placementInvoices: many(placementInvoices),
}));

// ─── Copy Versions (revision history) ────────────────────────

export const copyVersions = pgTable(
  "copy_versions",
  {
    id: text("id").primaryKey(),
    placementId: text("placement_id")
      .notNull()
      .references(() => placements.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    copyText: text("copy_text").notNull(),
    revisionNotes: text("revision_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("copy_versions_placement_version_idx").on(
      t.placementId,
      t.version
    ),
  ]
);

export const copyVersionsRelations = relations(copyVersions, ({ one }) => ({
  placement: one(placements, {
    fields: [copyVersions.placementId],
    references: [placements.id],
  }),
}));

// ─── Onboarding Rounds ──────────────────────────────────────

export const onboardingRounds = pgTable(
  "onboarding_rounds",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    label: text("label"),
    formType: text("form_type").notNull().default("newsletter"),
    formLink: text("form_link").notNull(),
    complete: boolean("complete").notNull().default(false),
    onboardingDocUrl: text("onboarding_doc_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("onboarding_rounds_campaign_id_idx").on(t.campaignId)]
);

export const onboardingRoundsRelations = relations(
  onboardingRounds,
  ({ one }) => ({
    campaign: one(campaigns, {
      fields: [onboardingRounds.campaignId],
      references: [campaigns.id],
    }),
  })
);

// ─── Billing Onboarding ─────────────────────────────────────

export const billingOnboarding = pgTable(
  "billing_onboarding",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    formLink: text("form_link").notNull(),
    complete: boolean("complete").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    billingContactName: text("billing_contact_name"),
    billingContactEmail: text("billing_contact_email"),
    ioSigningContactName: text("io_signing_contact_name"),
    ioSigningContactEmail: text("io_signing_contact_email"),
    billingAddress: text("billing_address"),
    poNumber: text("po_number"),
    invoiceCadence: jsonb("invoice_cadence").$type<InvoiceCadence>(),
    specialInstructions: text("special_instructions"),
    uploadedDocUrl: text("uploaded_doc_url"),
  },
  (t) => [
    uniqueIndex("billing_onboarding_campaign_id_idx").on(t.campaignId),
  ]
);

export const billingOnboardingRelations = relations(
  billingOnboarding,
  ({ one }) => ({
    campaign: one(campaigns, {
      fields: [billingOnboarding.campaignId],
      references: [campaigns.id],
    }),
  })
);

// ─── Campaign Manager Notes ────────────────────────────────

export const campaignManagerNotes = pgTable(
  "campaign_manager_notes",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    authorName: text("author_name").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("campaign_manager_notes_campaign_id_idx").on(t.campaignId)]
);

export const campaignManagerNotesRelations = relations(
  campaignManagerNotes,
  ({ one }) => ({
    campaign: one(campaigns, {
      fields: [campaignManagerNotes.campaignId],
      references: [campaigns.id],
    }),
  })
);

// ─── App Settings ──────────────────────────────────────────

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

// ─── Email Mailboxes ───────────────────────────────────────

export const mailboxes = pgTable(
  "mailboxes",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull().default("nylas"),
    emailAddress: text("email_address").notNull(),
    displayName: text("display_name"),
    nylasGrantId: text("nylas_grant_id"),
    nylasAccountId: text("nylas_account_id"),
    grantStatus: text("grant_status").notNull().default("disconnected"),
    syncCursor: text("sync_cursor"),
    lastWebhookCursor: text("last_webhook_cursor"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    providerMetadata: jsonb("provider_metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("mailboxes_email_address_idx").on(t.emailAddress),
    uniqueIndex("mailboxes_nylas_grant_id_idx").on(t.nylasGrantId),
  ]
);

// ─── Email Threads ─────────────────────────────────────────

export const emailThreads = pgTable(
  "email_threads",
  {
    id: text("id").primaryKey(),
    mailboxId: text("mailbox_id")
      .notNull()
      .references(() => mailboxes.id, { onDelete: "cascade" }),
    nylasThreadId: text("nylas_thread_id").notNull(),
    subject: text("subject").notNull().default(""),
    snippet: text("snippet"),
    participants: jsonb("participants"),
    unread: boolean("unread").notNull().default(true),
    inboundOnly: boolean("inbound_only").notNull().default(false),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    latestMessageId: text("latest_message_id"),
    status: text("status").notNull().default("active"),
    responseState: text("response_state").notNull().default("needs_review"),
    noReplyNeeded: boolean("no_reply_needed").notNull().default(false),
    needsAttention: boolean("needs_attention").notNull().default(true),
    lastAgentRunId: text("last_agent_run_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("email_threads_mailbox_thread_idx").on(t.mailboxId, t.nylasThreadId),
    index("email_threads_mailbox_updated_idx").on(t.mailboxId, t.updatedAt),
    index("email_threads_response_state_idx").on(t.responseState),
  ]
);

// ─── Email Messages ────────────────────────────────────────

export const emailMessages = pgTable(
  "email_messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => emailThreads.id, { onDelete: "cascade" }),
    mailboxId: text("mailbox_id")
      .notNull()
      .references(() => mailboxes.id, { onDelete: "cascade" }),
    nylasMessageId: text("nylas_message_id").notNull(),
    direction: text("direction").notNull(),
    subject: text("subject").notNull().default(""),
    fromName: text("from_name"),
    fromEmail: text("from_email"),
    toRecipients: jsonb("to_recipients"),
    ccRecipients: jsonb("cc_recipients"),
    bccRecipients: jsonb("bcc_recipients"),
    participants: jsonb("participants"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    snippet: text("snippet"),
    rawPayload: jsonb("raw_payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("email_messages_nylas_message_id_idx").on(t.nylasMessageId),
    index("email_messages_thread_sent_at_idx").on(t.threadId, t.sentAt),
  ]
);

// ─── Email Thread Campaign Links ───────────────────────────

export const emailThreadCampaignLinks = pgTable(
  "email_thread_campaign_links",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => emailThreads.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    confidence: integer("confidence").notNull().default(0),
    isPrimary: boolean("is_primary").notNull().default(false),
    matchReason: text("match_reason").notNull(),
    source: text("source").notNull().default("auto"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("email_thread_campaign_links_unique_idx").on(t.threadId, t.campaignId),
    index("email_thread_campaign_links_campaign_idx").on(t.campaignId),
  ]
);

// ─── Email Agent Runs ──────────────────────────────────────

export const emailAgentRuns = pgTable(
  "email_agent_runs",
  {
    id: text("id").primaryKey(),
    mailboxId: text("mailbox_id")
      .notNull()
      .references(() => mailboxes.id, { onDelete: "cascade" }),
    threadId: text("thread_id")
      .notNull()
      .references(() => emailThreads.id, { onDelete: "cascade" }),
    triggerMessageId: text("trigger_message_id"),
    status: text("status").notNull().default("pending"),
    model: text("model"),
    promptVersion: text("prompt_version"),
    knowledgeBaseHash: text("knowledge_base_hash"),
    knowledgeBasePath: text("knowledge_base_path"),
    confidence: integer("confidence"),
    rationaleSummary: text("rationale_summary"),
    missingDataFlags: jsonb("missing_data_flags"),
    safetyFlags: jsonb("safety_flags"),
    toolCalls: jsonb("tool_calls"),
    rawResponse: jsonb("raw_response"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("email_agent_runs_thread_created_idx").on(t.threadId, t.createdAt),
    index("email_agent_runs_status_idx").on(t.status),
  ]
);

// ─── Email Agent Run Steps ─────────────────────────────────

export const emailAgentRunSteps = pgTable(
  "email_agent_run_steps",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => emailAgentRuns.id, { onDelete: "cascade" }),
    stepType: text("step_type").notNull(),
    title: text("title").notNull(),
    content: text("content"),
    citations: jsonb("citations"),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("email_agent_run_steps_run_idx").on(t.runId, t.createdAt)]
);

// ─── Email Drafts ──────────────────────────────────────────

export const emailDrafts = pgTable(
  "email_drafts",
  {
    id: text("id").primaryKey(),
    mailboxId: text("mailbox_id")
      .notNull()
      .references(() => mailboxes.id, { onDelete: "cascade" }),
    threadId: text("thread_id")
      .notNull()
      .references(() => emailThreads.id, { onDelete: "cascade" }),
    runId: text("run_id").references(() => emailAgentRuns.id, { onDelete: "set null" }),
    nylasDraftId: text("nylas_draft_id"),
    status: text("status").notNull().default("generated"),
    subject: text("subject").notNull().default(""),
    bodyHtml: text("body_html").notNull().default(""),
    bodyText: text("body_text"),
    explanation: text("explanation"),
    explanationSummary: text("explanation_summary"),
    explanationPayload: jsonb("explanation_payload"),
    isCurrent: boolean("is_current").notNull().default(true),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("email_drafts_thread_current_idx").on(t.threadId, t.isCurrent),
    index("email_drafts_status_idx").on(t.status),
  ]
);

// ─── Email Webhook Events ──────────────────────────────────

export const emailWebhookEvents = pgTable(
  "email_webhook_events",
  {
    id: text("id").primaryKey(),
    mailboxId: text("mailbox_id").references(() => mailboxes.id, { onDelete: "set null" }),
    externalEventId: text("external_event_id"),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    processingError: text("processing_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("email_webhook_events_external_event_idx").on(t.externalEventId),
    index("email_webhook_events_type_idx").on(t.eventType, t.createdAt),
  ]
);

export const mailboxesRelations = relations(mailboxes, ({ many }) => ({
  threads: many(emailThreads),
  messages: many(emailMessages),
  drafts: many(emailDrafts),
  agentRuns: many(emailAgentRuns),
}));

export const emailThreadsRelations = relations(emailThreads, ({ one, many }) => ({
  mailbox: one(mailboxes, {
    fields: [emailThreads.mailboxId],
    references: [mailboxes.id],
  }),
  messages: many(emailMessages),
  campaignLinks: many(emailThreadCampaignLinks),
  drafts: many(emailDrafts),
  agentRuns: many(emailAgentRuns),
}));

export const emailMessagesRelations = relations(emailMessages, ({ one }) => ({
  thread: one(emailThreads, {
    fields: [emailMessages.threadId],
    references: [emailThreads.id],
  }),
  mailbox: one(mailboxes, {
    fields: [emailMessages.mailboxId],
    references: [mailboxes.id],
  }),
}));

export const emailThreadCampaignLinksRelations = relations(
  emailThreadCampaignLinks,
  ({ one }) => ({
    thread: one(emailThreads, {
      fields: [emailThreadCampaignLinks.threadId],
      references: [emailThreads.id],
    }),
    campaign: one(campaigns, {
      fields: [emailThreadCampaignLinks.campaignId],
      references: [campaigns.id],
    }),
  })
);

export const emailAgentRunsRelations = relations(emailAgentRuns, ({ one, many }) => ({
  mailbox: one(mailboxes, {
    fields: [emailAgentRuns.mailboxId],
    references: [mailboxes.id],
  }),
  thread: one(emailThreads, {
    fields: [emailAgentRuns.threadId],
    references: [emailThreads.id],
  }),
  steps: many(emailAgentRunSteps),
  drafts: many(emailDrafts),
}));

export const emailAgentRunStepsRelations = relations(emailAgentRunSteps, ({ one }) => ({
  run: one(emailAgentRuns, {
    fields: [emailAgentRunSteps.runId],
    references: [emailAgentRuns.id],
  }),
}));

export const emailDraftsRelations = relations(emailDrafts, ({ one }) => ({
  mailbox: one(mailboxes, {
    fields: [emailDrafts.mailboxId],
    references: [mailboxes.id],
  }),
  thread: one(emailThreads, {
    fields: [emailDrafts.threadId],
    references: [emailThreads.id],
  }),
  run: one(emailAgentRuns, {
    fields: [emailDrafts.runId],
    references: [emailAgentRuns.id],
  }),
}));

// ─── Xero Connections ──────────────────────────────────────

export const xeroConnections = pgTable("xero_connections", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  tenantName: text("tenant_name").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

// ─── Campaign Invoices (join table) ────────────────────────

export const campaignInvoices = pgTable(
  "campaign_invoices",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    xeroInvoiceId: text("xero_invoice_id").notNull(),
    dashboardStatus: text("dashboard_status")
      .notNull()
      .default("AWAITING_PAYMENT"),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull(),
    notes: text("notes"),
  },
  (t) => [
    uniqueIndex("campaign_invoices_campaign_invoice_idx").on(
      t.campaignId,
      t.xeroInvoiceId
    ),
    index("campaign_invoices_campaign_id_idx").on(t.campaignId),
  ]
);

export const campaignInvoicesRelations = relations(
  campaignInvoices,
  ({ one }) => ({
    campaign: one(campaigns, {
      fields: [campaignInvoices.campaignId],
      references: [campaigns.id],
    }),
  })
);

// ─── Placement Invoices (join table) ────────────────────────

export const placementInvoices = pgTable(
  "placement_invoices",
  {
    id: text("id").primaryKey(),
    placementId: text("placement_id")
      .notNull()
      .references(() => placements.id, { onDelete: "cascade" }),
    xeroInvoiceId: text("xero_invoice_id").notNull(),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull(),
    notes: text("notes"),
  },
  (t) => [
    uniqueIndex("placement_invoices_placement_invoice_idx").on(
      t.placementId,
      t.xeroInvoiceId
    ),
    index("placement_invoices_placement_id_idx").on(t.placementId),
  ]
);

export const placementInvoicesRelations = relations(
  placementInvoices,
  ({ one }) => ({
    placement: one(placements, {
      fields: [placementInvoices.placementId],
      references: [placements.id],
    }),
  })
);
