import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
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
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id),
    status: text("status").notNull(), // CampaignStatus union
    campaignManager: text("campaign_manager"),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    adLineItems: jsonb("ad_line_items").$type<AdLineItem[]>(),
    placementsDescription: text("placements_description"),
    performanceTableUrl: text("performance_table_url"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("campaigns_client_id_idx").on(t.clientId)]
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
    filloutLink: text("fillout_link").notNull(),
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
    filloutLink: text("fillout_link").notNull(),
    complete: boolean("complete").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    billingContactName: text("billing_contact_name"),
    billingContactEmail: text("billing_contact_email"),
    billingAddress: text("billing_address"),
    poNumber: text("po_number"),
    invoiceCadence: jsonb("invoice_cadence").$type<InvoiceCadence>(),
    specialInstructions: text("special_instructions"),
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
