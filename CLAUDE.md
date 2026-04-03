# Peak Client Portal

## Project Overview

A client-facing web portal where The Peak's advertising clients can review and approve ad copy, track revision history, and monitor campaign performance — all via a unique URL with no login required.

Internally, the portal also serves as the team's campaign management dashboard for managing campaigns, placements, onboarding, invoicing, Beehiiv publishing, and AI-assisted email drafting.

**Production URL:** `https://portal.thepeakmediaco.com`

---

## The Core Concept: URL = Identity

Each client gets a permanent unique link:
```
portal.thepeakmediaco.com/portal/[unique-client-id]
```

No accounts. No passwords. The URL is their credential. Portal IDs are 12-char nanoid strings using a custom alphabet (no ambiguous characters like 0/O, 1/l/I). Clients bookmark the link and return to it for every campaign.

Campaigns also have their own `portal_id` for direct deep-linking:
```
portal.thepeakmediaco.com/portal/[client-portal-id]/[campaign-portal-id]
```

---

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript 5
- **Styling:** Tailwind CSS 3.4
- **Database:** PostgreSQL (Neon) via `@vercel/postgres` + Drizzle ORM
- **Hosting:** Vercel (main app) + Railway (MCP server)
- **Rich Text Editor:** Tiptap (with markdown support)
- **File Storage:** Vercel Blob
- **AI:** Anthropic Claude (ad copy generation via `ANTHROPIC_COPY_MODEL`), OpenAI (campaign email summaries via `OPENAI_API_KEY`)
- **Integrations:**
  - Beehiiv API (publishing drafts + fetching performance stats)
  - Xero API (OAuth 2.0 invoice management)
  - Missive (primary email platform — webhook-driven AI draft generation)
  - Nylas (legacy email inbox routes, still in repo)
  - Slack (campaign alerts and daily summaries)
  - Google Workspace CLI (Gmail access for campaign email insights cron)
  - PandaDoc (insertion order / IO document creation)

---

## Database Schema (PostgreSQL via Drizzle)

All state lives in PostgreSQL. Schema is defined in `lib/db/schema.ts`, queries in `lib/db/queries.ts`, mutations in `lib/db/mutations.ts`.

### Core Tables

**`clients`** — Client accounts
- `id`, `name`, `portal_id` (unique, used in client URLs)

**`campaigns`** — Campaign metadata
- `id`, `name`, `portal_id` (unique, used in campaign URLs), `client_id` (FK)
- `category` ("Standard" | "Evergreen"), `status` (CampaignStatus), `campaign_manager` (Matheus | Brett | Will)
- `contact_name`, `contact_email`, `currency` ("CAD" | "USD"), `tax_eligible`
- `ad_line_items` (JSONB `AdLineItem[]`), `placements_description`, `performance_table_url`, `notes`
- Onboarding fields (inline, from form submission): `onboarding_campaign_objective`, `onboarding_key_message`, `onboarding_talking_points`, `onboarding_call_to_action`, `onboarding_target_audience`, `onboarding_tone_guidelines`, `onboarding_submitted_at`
- `legacy_onboarding_doc_url` — old URL-based doc reference before inline onboarding
- PandaDoc IO fields: `pandadoc_document_id`, `pandadoc_status`, `pandadoc_document_url`, `pandadoc_created_at`
- `created_at`

**`placements`** — Individual ad placements within a campaign
- `id`, `campaign_id` (FK, cascade delete), `name`, `type` (PlacementType), `publication` (Publication)
- `scheduled_date` (stored as `YYYY-MM-DD` string), `status` (PlacementStatus)
- `current_copy`, `copy_version`, `revision_notes`, `onboarding_round_id`, `copy_producer` ("Us" | "Client")
- `notes`, `onboarding_brief`
- `stats` (JSONB `PerformanceStats`), `image_url`, `logo_url`, `link_to_placement`
- `conflict_preference` ("Defer if conflict" | "Date is crucial"), `beehiiv_post_id`
- `created_at`, `published_at`

**`copy_versions`** — Revision history for placement copy
- `id`, `placement_id` (FK, cascade delete), `version`, `copy_text`, `revision_notes`, `created_at`
- Unique constraint on `(placement_id, version)`

**`onboarding_rounds`** — Form submission rounds per campaign
- `id`, `campaign_id` (FK, cascade delete), `label`, `form_type` ("newsletter" | "podcast"), `form_link`, `complete`, `onboarding_doc_url`, `created_at`

**`billing_onboarding`** — Billing form data per campaign (one-to-one with campaign)
- `id`, `campaign_id` (FK, cascade delete, unique), `form_link`, `complete`, `completed_at`
- `billing_contact_name`, `billing_contact_email`, `io_signing_contact_name`, `io_signing_contact_email`
- `billing_address`, `po_number`, `invoice_cadence` (JSONB `InvoiceCadence`), `special_instructions`, `uploaded_doc_url`

**`campaign_manager_notes`** — Internal notes on campaigns by team members
- `id`, `campaign_id` (FK, cascade delete), `author_name` (CampaignManager), `body`, `created_at`

**`app_settings`** — Key-value store for system config
- `key` (PK), `value`, `updated_at`

### Invoicing Tables

**`xero_connections`** — OAuth token storage for Xero
- `id`, `tenant_id`, `tenant_name`, `access_token`, `refresh_token`, `expires_at`, `created_at`, `updated_at`

**`campaign_invoices`** — Links Xero invoices to campaigns
- `id`, `campaign_id` (FK, cascade delete), `xero_invoice_id`, `dashboard_status` (internal override), `linked_at`, `notes`
- Unique on `(campaign_id, xero_invoice_id)`

**`placement_invoices`** — Links Xero invoices to placements
- `id`, `placement_id` (FK, cascade delete), `xero_invoice_id`, `linked_at`, `notes`
- Unique on `(placement_id, xero_invoice_id)`

### Email Tables

**`mailboxes`** — Email provider integrations (one per inbox)
- `id`, `provider` (default: "nylas"), `email_address`, `display_name`
- `nylas_grant_id`, `nylas_account_id`, `grant_status`, `sync_cursor`, `last_webhook_cursor`, `last_synced_at`
- `provider_metadata` (JSONB), `created_at`, `updated_at`

**`email_threads`** — Synced email threads
- `id`, `mailbox_id` (FK), `nylas_thread_id`, `subject`, `snippet`, `participants` (JSONB)
- `unread`, `inbound_only`, `last_message_at`, `latest_message_id`
- `status` ("active" etc.), `response_state` ("needs_review" etc.), `no_reply_needed`, `needs_attention`
- `last_agent_run_id`, `metadata` (JSONB), `created_at`, `updated_at`

**`email_messages`** — Individual messages within threads
- `id`, `thread_id` (FK), `mailbox_id` (FK), `nylas_message_id`
- `direction`, `subject`, `from_name`, `from_email`, `to_recipients`, `cc_recipients`, `bcc_recipients` (JSONB)
- `sent_at`, `body_text`, `body_html`, `snippet`, `raw_payload` (JSONB), `created_at`, `updated_at`

**`email_thread_campaign_links`** — Associates email threads with campaigns
- `id`, `thread_id` (FK), `campaign_id` (FK), `confidence` (0-100), `is_primary`, `match_reason`, `source` ("auto" | "manual")
- `metadata` (JSONB), `created_at`, `updated_at`

**`email_agent_runs`** — AI agent execution records per thread
- `id`, `mailbox_id` (FK), `thread_id` (FK), `trigger_message_id`
- `status` ("pending" | "completed" | "failed"), `model`, `prompt_version`, `knowledge_base_hash`, `knowledge_base_path`
- `confidence`, `rationale_summary`, `missing_data_flags` (JSONB), `safety_flags` (JSONB), `tool_calls` (JSONB), `raw_response` (JSONB)
- `error_message`, `created_at`, `updated_at`, `completed_at`

**`email_agent_run_steps`** — Step-by-step log of an agent run
- `id`, `run_id` (FK), `step_type`, `title`, `content`, `citations` (JSONB), `payload` (JSONB), `created_at`

**`email_drafts`** — AI-generated email drafts
- `id`, `mailbox_id` (FK), `thread_id` (FK), `run_id` (FK, nullable)
- `nylas_draft_id`, `status` ("generated" | "approved" | "sent")
- `subject`, `body_html`, `body_text`, `explanation`, `explanation_summary`, `explanation_payload` (JSONB)
- `is_current`, `approved_by`, `approved_at`, `sent_at`, `metadata` (JSONB), `created_at`, `updated_at`

**`email_webhook_events`** — Webhook audit trail (idempotency + debugging)
- `id`, `mailbox_id` (FK, nullable), `external_event_id` (unique), `event_type`
- `payload` (JSONB), `processed_at`, `processing_error`, `created_at`

---

## Key Types

### Enums

**`PlacementStatus`** — 17 values across three workflows (see Placement Workflows section):
- Newsletter: `"New Campaign"` | `"Copywriting in Progress"` | `"Peak Team Review Complete"` | `"Sent for Approval"` | `"Approved"`
- Podcast spot: `"Onboarding Requested"` | `"Drafting Script"` | `"Script Review by Client"` | `"Approved Script"` | `"Audio Sent for Approval"` | `"Audio Approved"`
- Podcast interview: `"Onboarding Requested"` | `"Drafting Questions"` | `"Questions In Review"` | `"Client Reviewing Interview"` | `"Revising for Client"` | `"Approved Interview"`

**`CampaignStatus`:** `"Onboarding to be sent"` | `"Waiting for onboarding"` | `"Active"` | `"Placements Completed"` | `"Wrapped"`

**`CampaignCategory`:** `"Standard"` | `"Evergreen"`

**`PlacementType`** — 10 values:
- Newsletter types: `"Primary"` | `"Secondary"` | `"Peak Picks"` | `"Beehiv"` | `"Smart Links"` | `"BLS"` | `"Podcast Ad"`
- Podcast types: `":30 Pre-Roll"` | `":30 Mid-Roll"` | `"15 Minute Interview"`

**`Publication`:** `"The Peak"` | `"Peak Money"` | `"Peak Daily Podcast"`

**`CampaignManager`:** `"Matheus"` | `"Brett"` | `"Will"` (enforced via DB check constraint)

**`OnboardingFormType`:** `"newsletter"` | `"podcast"`

### JSONB Field Structures

**`AdLineItem`:** `{ quantity: number, type: PlacementType, publication?: Publication, pricePerUnit: number }`

**`PerformanceStats`:** `{ openRate?, totalOpens?, uniqueOpens?, totalClicks?, uniqueClicks?, totalSends?, ctr?, adRevenue? }`

**`InvoiceCadence`:** union of:
- `{ type: "lump-sum", totalAmount: number, paymentTerms: string }`
- `{ type: "equal-monthly", totalAmount: number, numberOfMonths: number, monthlyAmount: number }`
- `{ type: "per-month-usage" }` — rates come from `campaign.adLineItems`

---

## Placement Workflows

There are three separate status workflows depending on placement type. Use `getPlacementStatusesFor(type, publication)` from `lib/types.ts` to get valid statuses for a given placement.

**Newsletter placements** (publication = "The Peak" or "Peak Money", type = newsletter types):
1. New Campaign → Copywriting in Progress → Peak Team Review Complete → Sent for Approval → **Approved**

**Podcast spot placements** (publication = "Peak Daily Podcast", type = ":30 Pre-Roll" or ":30 Mid-Roll"):
1. Onboarding Requested → Drafting Script → Script Review by Client → Approved Script → Audio Sent for Approval → **Audio Approved**

**Podcast interview placements** (type = "15 Minute Interview"):
1. Onboarding Requested → Drafting Questions → Questions In Review → Client Reviewing Interview → Revising for Client → **Approved Interview**

Default starting status: `"New Campaign"` for newsletter, `"Onboarding Requested"` for podcast.

Helper functions in `lib/types.ts`: `isPodcastPlacement()`, `isPodcastInterviewType()`, `isApprovedStatus()`, `isClientReviewStatus()`, `getPlacementWorkflowGroup()`.

---

## Project Structure

```
/app
  /portal
    /[clientId]/page.tsx                              # Client home — all their campaigns
    /[clientId]/[campaignId]/page.tsx                 # Campaign — all placements
    /[clientId]/[campaignId]/[placementId]/page.tsx   # Placement detail — approval UI + stats
    /[clientId]/[campaignId]/form/                    # Onboarding form pages

  /dashboard
    /page.tsx                                         # Internal dashboard (table + calendar views)
    /[campaignId]/page.tsx                            # Campaign admin
    /[campaignId]/[placementId]/page.tsx              # Placement admin
    /login/page.tsx                                   # Google OAuth login
    /email/                                           # Email inbox dashboard
    /invoicing/page.tsx                               # Invoice management
    /invoicing/[invoiceLinkId]/                       # Invoice detail
    /prompts/                                         # AI prompt editor

  /api
    # Client-facing (no auth)
    /approve/route.ts                  # Client approves placement
    /revise/route.ts                   # Client submits revision notes
    /submit-onboarding/route.ts        # Submit newsletter onboarding form
    /submit-billing-onboarding/route.ts
    /save-onboarding/route.ts          # Save onboarding draft
    /save-billing-onboarding/route.ts

    # Admin (dashboard auth required)
    /create-campaign/route.ts
    /update-campaign/route.ts
    /delete-campaign/route.ts
    /add-placement/route.ts
    /update-placement/route.ts
    /delete-placement/route.ts
    /update-copy/route.ts              # Update copy (increments version + saves history)
    /update-schedule/route.ts          # Set scheduled_date on placement
    /bulk-schedule/route.ts            # Bulk assign dates to placements
    /schedule-capacity/route.ts        # Check capacity for date range
    /generate-copy/route.ts            # AI copy generation (Claude)
    /publish-beehiiv/route.ts          # Create Beehiiv draft from approved copy
    /sync-beehiiv-stats/route.ts       # Fetch Beehiiv stats and save to DB
    /create-onboarding-round/route.ts
    /update-onboarding-round/route.ts
    /update-placement-round/route.ts
    /update-ad-line-items/route.ts
    /update-billing-onboarding/route.ts
    /override-onboarding/route.ts
    /upload-onboarding-doc/route.ts
    /upload-placement-asset/route.ts
    /create-io/route.ts                # Create PandaDoc insertion order
    /campaign-manager-notes/route.ts
    /update-setting/route.ts           # Update app_settings key-value
    /blob/[mode]/route.ts              # Vercel Blob proxy

    /dashboard/
      /login/route.ts                  # Initiate Google OAuth
      /callback/route.ts               # OAuth callback, set session cookie
      /logout/route.ts                 # Clear session cookie
      /tasks/dismiss/route.ts

    /xero/
      /connect/route.ts                # Initiate Xero OAuth
      /callback/route.ts               # Xero OAuth callback
      /disconnect/route.ts
      /search-invoices/route.ts
      /link-invoice/route.ts
      /unlink-invoice/route.ts
      /create-invoice/route.ts

    /invoicing/
      /update-note/route.ts
      /update-dashboard-status/route.ts

    /email/
      /missive/webhook/route.ts        # PRIMARY: Missive webhook → AI draft
      /webhook/route.ts                # Legacy Nylas webhook
      /auth/start/route.ts             # Nylas auth start
      /auth/callback/route.ts          # Nylas auth callback
      /sync/route.ts                   # Manual email sync
      /threads/route.ts                # List email threads
      /threads/[threadId]/route.ts     # Thread detail
      /threads/[threadId]/draft/route.ts
      /threads/[threadId]/links/route.ts
      /threads/[threadId]/rerun/route.ts
      /drafts/[draftId]/route.ts
      /drafts/[draftId]/send/route.ts

    /cron/
      /email-sync/route.ts             # Periodic email sync (Nylas)
      /campaign-email-insights/route.ts # Gmail SLA monitoring per campaign
      /campaign-morning-summary/route.ts # Daily summary to Slack
      /slack-alerts/route.ts           # Alert deduplication + Slack posting

    /slack/
      /slash/route.ts                  # Slack slash command handler

/lib
  /db/
    /index.ts            # DB client + re-exports
    /schema.ts           # Drizzle table definitions + relations
    /queries.ts          # Read operations (1700+ lines)
    /mutations.ts        # Write operations (1500+ lines)
  /email/
    /agent.ts            # AI draft generation logic (Claude)
    /service.ts          # Email workflow orchestration
    /missive.ts          # Missive API client
    /missive-service.ts  # Missive service layer (higher-level ops)
    /nylas.ts            # Nylas API client (legacy)
    /db.ts               # Email-specific DB operations
    /types.ts            # Email domain types
    /config.ts           # Email configuration helpers
    /constants.ts        # Email constants (addresses, defaults)
    /content.ts          # Email content formatting
    /matching.ts         # Campaign-to-thread matching logic
    /knowledge.ts        # Knowledge base loader
    /knowledge.md        # AI knowledge base — tone, rules, examples for the email agent
  /types.ts              # Core domain types + placement workflow helpers
  /beehiiv.ts            # Beehiiv API client
  /xero.ts               # Xero API helpers (OAuth, token refresh, invoice fetch)
  /xero-types.ts         # Xero data types
  /ai.ts                 # AI/LLM utilities
  /ai-constants.ts       # AI prompt constants
  /dashboard-auth.ts     # Google OAuth + HMAC session helpers
  /dashboard-tasks.ts    # Dashboard task generation logic
  /format-copy.tsx       # Copy formatting utilities
  /placement-meta.ts     # Placement metadata helpers
  /placement-editability.ts
  /campaign-email-insights.ts  # Gmail-based SLA monitoring
  /campaign-manager-notes.ts
  /invoice-status.ts
  /schedule-capacity.ts  # Capacity scheduling logic
  /slack.ts              # Slack API wrapper
  /slack-events.ts       # Slack event types/handling
  /slack-alert-dedupe.ts # Alert deduplication
  /blob-url.ts           # Vercel Blob URL helpers
  /urls.ts               # App URL helpers
  /env.ts                # Typed env var helpers (getRequiredEnv)
  /client-ids.ts         # Portal ID generation (nanoid)

/components
  # Client Portal
  CopyReview.tsx              # Approval/revision UI
  CopyEditor.tsx              # Rich text editor (Tiptap + markdown)
  RevisionHistory.tsx         # Copy version history display
  PerformanceStats.tsx        # Stats display
  StatusBadge.tsx             # Status pill component
  ConfirmationScreen.tsx      # Post-action confirmation
  CampaignCard.tsx            # Campaign card for portal home

  # Admin Dashboard
  AdminPlacementDetail.tsx    # Full placement editor (copy, metadata, invoices)
  AdminPlacementDashboard.tsx # Placement dashboard container
  AdminPlacementList.tsx      # Placement list with inline controls
  CampaignMetadataEditor.tsx  # Campaign info editor
  CreateCampaignForm.tsx      # New campaign form
  AddPlacementForm.tsx        # Create new placement
  OnboardingStatus.tsx        # Onboarding form status + responses
  OnboardingForm.tsx          # Onboarding form component
  BillingOnboardingForm.tsx   # Billing form component
  BillingDetails.tsx          # Billing info display
  DashboardTable.tsx          # Campaign table with filtering
  CalendarView.tsx            # Calendar grid view of placements
  DashboardViewToggle.tsx     # Table/calendar toggle
  PlacementDashboard.tsx      # Placement list container
  AdLineItems.tsx             # Ad pricing/item editor
  AiPromptEditor.tsx          # AI prompt configuration UI
  GenerateCopyButton.tsx      # Trigger AI copy generation
  DashboardTaskList.tsx       # Dashboard task list
  CampaignManagerNotesPanel.tsx  # Internal campaign notes

  # Invoicing
  CampaignInvoiceSection.tsx  # Campaign invoice display
  InvoiceLinkModal.tsx        # Modal to search and link Xero invoices
  InvoiceStatusBadge.tsx      # Invoice status indicator
  InvoiceDashboardStatusEditor.tsx
  InvoiceNoteEditor.tsx
  InvoiceUnlinkButton.tsx
  DashboardInvoiceStatusBadge.tsx
  XeroConnectButton.tsx       # OAuth button for Xero
  CreateIoButton.tsx          # Create PandaDoc IO

  # Other
  BrandMark.tsx               # Brand logo/mark component

/mcp-server                   # Standalone MCP server (deployed to Railway)
  /index.ts                   # MCP tools: list_campaigns, get_campaign, create_campaign, update_placement_status
  /README.md

/email-worker                 # Legacy email worker (no longer primary)

/drizzle                      # Migration SQL files
/scripts                      # One-off scripts (seed, migration)
/middleware.ts                # Protects /dashboard routes + admin API routes
```

---

## Features

### Client Portal (`/portal/[clientId]/...`)
- URL-based access, no auth required
- Campaign list with status badges
- Placement detail: view copy, approve or submit revision notes
- Inline copy editing before approval
- Revision history (all previous versions with notes)
- Performance stats display (from Beehiiv)

### Internal Dashboard (`/dashboard/...`)
- Google OAuth protected (see Authentication section)
- Campaign list in table or calendar grid view
- Campaign admin: edit metadata, manage placements, view onboarding status, add internal notes
- Placement admin: edit copy (Tiptap rich text), set metadata, link invoices, sync Beehiiv stats
- Bulk scheduling with per-type daily capacity limits
- Create/delete campaigns and placements
- AI copy generation (Claude) via Generate Copy button
- Email inbox for viewing/managing client email threads
- Invoice management with Xero integration

### Email Agent (Missive-native, primary flow)
- Missive webhook at `/api/email/missive/webhook` triggers the agent
- Agent reads conversation, generates a reply draft using Claude
- Draft is created in Missive and stored in `email_drafts` for audit
- Agent run history stored in `email_agent_runs` + `email_agent_run_steps`
- Knowledge base lives in `lib/email/knowledge.md` — contains The Peak's tone of voice, rules, and examples
- Trigger: comment on a Missive conversation containing `@ai draft` (configurable via `MISSIVE_AI_TRIGGER_PREFIX`)
- Legacy Nylas inbox routes still exist under `/api/email/*` but Missive is the active integration

### Campaign Email Insights (cron)
- Daily cron at `/api/cron/campaign-email-insights`
- Uses Google Workspace CLI to scan Gmail threads associated with campaign contacts
- Checks 3-hour client-response SLA compliance
- Stores insight snapshot per campaign, displayed on admin campaign detail page

### Slack Integration
- Daily morning summary cron at `/api/cron/campaign-morning-summary`
- Slack alerts cron at `/api/cron/slack-alerts` with deduplication
- Slash command handler at `/api/slack/slash`

### Beehiiv Integration (`lib/beehiiv.ts`)
- Always create as a **draft**, never publish directly
- Fetch posts by ID with expanded stats
- Search posts by URL match (with date window)
- Extract stats: opens, unique opens, open rate, clicks
- Store Beehiiv post ID on placement for future stat lookups

### Xero Invoicing (`lib/xero.ts`)
- Full OAuth 2.0 flow with auto token refresh (5-min buffer)
- Search invoices by term or status
- Link/unlink invoices at campaign or placement level
- Internal `dashboard_status` override on `campaign_invoices` separate from Xero's status
- Create invoices via `/api/xero/create-invoice`

### PandaDoc Insertion Orders
- Create IO documents via `/api/create-io` → `CreateIoButton` component
- IO metadata stored on campaign: `pandadoc_document_id`, `pandadoc_status`, `pandadoc_document_url`

### Capacity Scheduling
- Daily limits per placement type per publication (Primary: 1/day, Secondary: 1/day, Peak Picks: 2/day, others: unlimited)
- Check available slots for date range via `/api/schedule-capacity`
- Bulk schedule respecting capacity constraints via `/api/bulk-schedule`
- Weekdays only

### Copy Versioning
- Each copy update increments `copy_version`
- Previous versions saved to `copy_versions` table
- Full revision history displayed to clients and admins

### MCP Server (`/mcp-server`)
- Deployed separately to Railway
- Exposes AI tools over Streamable HTTP: `list_campaigns`, `get_campaign`, `create_campaign`, `update_placement_status`
- Start locally: `npm run mcp:start` → `POST http://localhost:3000/mcp`
- Protected by `MCP_API_KEY` bearer token

---

## Authentication

### Client Portal
None — the portal ID in the URL is the credential.

### Dashboard
Google OAuth 2.0 with an email allowlist. Session is a 7-day HMAC-signed cookie.

Flow:
1. GET `/dashboard/login` → shows login button
2. POST → redirects to Google OAuth (`/api/dashboard/login`)
3. Google redirects to `/api/dashboard/callback` with code
4. Callback verifies email is in `DASHBOARD_ALLOWED_EMAILS` (or matches `GOOGLE_HOSTED_DOMAIN`)
5. Sets secure HTTP-only cookie `dashboard_auth` (7-day TTL, HMAC-signed with `DASHBOARD_SESSION_SECRET`)
6. `middleware.ts` checks cookie on all `/dashboard/*` routes and protected API routes

Logout: `/api/dashboard/logout` clears the cookie.

### Protected API Routes
`middleware.ts` lists all admin API prefixes that require dashboard auth. Public client-facing endpoints (approve, revise, submit-onboarding, etc.) are explicitly unprotected.

---

## Environment Variables

```
# Database (Neon / Vercel Postgres)
POSTGRES_URL=
POSTGRES_URL_NON_POOLING=

# Beehiiv
BEEHIIV_API_KEY=
BEEHIIV_PUBLICATION_ID=

# Xero OAuth
XERO_CLIENT_ID=
XERO_CLIENT_SECRET=

# Dashboard Auth (Google OAuth)
DASHBOARD_SESSION_SECRET=          # HMAC signing secret for session cookies
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
DASHBOARD_ALLOWED_EMAILS=          # Comma-separated allowed emails
GOOGLE_HOSTED_DOMAIN=              # Optional: allow entire Google Workspace domain

# App
NEXT_PUBLIC_BASE_URL=              # e.g., https://portal.thepeakmediaco.com

# AI / Copy Generation
ANTHROPIC_API_KEY=                 # Used for ad copy generation
ANTHROPIC_COPY_MODEL=              # Claude model for copy (default: claude-sonnet-4-20250514)
OPENAI_API_KEY=                    # Used for campaign email summaries
CAMPAIGN_EMAIL_OPENAI_MODEL=       # OpenAI model (default: gpt-4.1-mini)

# Email Agent (Missive — primary)
MISSIVE_API_TOKEN=
MISSIVE_WEBHOOK_SECRET=
MISSIVE_AI_TRIGGER_PREFIX=         # Comment prefix to trigger agent (default: "@ai draft")
MISSIVE_FROM_EMAIL=                # Sender alias (default: adops@thepeakmediaco.com)
MISSIVE_ADD_DRAFT_TO_INBOX=        # Set "false" to skip adding drafts to inboxes
MISSIVE_API_BASE_URL=              # Override Missive API base URL

# Email Agent (Nylas — legacy inbox routes)
NYLAS_API_KEY=
NYLAS_CLIENT_ID=
NYLAS_CALLBACK_URI=
NYLAS_WEBHOOK_SECRET=
EMAIL_MAILBOX_ADDRESS=

# Campaign Email Insights (Gmail via Google Workspace CLI)
CRON_SECRET=                       # Bearer token for all cron endpoints
GOOGLE_WORKSPACE_CLI_BIN=          # Path to gws binary
GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON_B64=  # Base64 OAuth credentials JSON
CAMPAIGN_EMAIL_GMAIL_USER_ID=      # Gmail user (default: adops@thepeakmediaco.com)
CAMPAIGN_EMAIL_WINDOW_DAYS=        # Lookback days (default: 14)
CAMPAIGN_EMAIL_MAX_THREADS=        # Max threads per campaign (default: 12)
CAMPAIGN_EMAIL_MAX_CAMPAIGNS=      # Max campaigns per run (default: 50)
CAMPAIGN_EMAIL_INTERNAL_DOMAINS=   # Internal domains for team reply detection (default: thepeakmediaco.com)

# Slack
SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=

# MCP Server
MCP_API_KEY=                       # Bearer token for MCP server (optional in dev)

# PandaDoc
PANDADOC_API_KEY=                  # (if applicable)
```

---

## Database Commands

```bash
npm run db:generate   # Generate migration from schema changes
npm run db:push       # Apply migrations to database
npm run db:studio     # Open Drizzle Studio
```

---

## Implementation Notes

### PostgreSQL is the Source of Truth
All state lives in PostgreSQL (Neon). The app reads from and writes to the DB directly via Drizzle ORM.

### Beehiiv Publishing
Always create as a **draft** in Beehiiv, never publish directly. Store the returned Beehiiv post ID on the placement record.

### Xero OAuth
Uses direct API calls (not the xero-node SDK) for serverless compatibility on Vercel. Tokens stored in `xero_connections`, auto-refreshed when within 5 minutes of expiry.

### Dashboard Auth
Google OAuth + HMAC-signed session cookie. `DASHBOARD_SESSION_SECRET` is required. Either `DASHBOARD_ALLOWED_EMAILS` or `GOOGLE_HOSTED_DOMAIN` must be set.

### Email Agent
The active email integration is **Missive** (webhook-driven). The Nylas-based inbox UI and routes still exist but are the legacy path. `lib/email/knowledge.md` is the AI's operating guide — update it to change agent behaviour (tone, rules, sign-offs, etc.).

### Podcast vs Newsletter
Podcast and newsletter placements have entirely separate status workflows. Always use `getPlacementStatusesFor(type, publication)` to get valid statuses. Never assume a placement follows the newsletter workflow. `isPodcastPlacement(type, publication)` is the canonical check.

### Campaign Categories
- **Standard**: Regular campaigns with normal onboarding flow
- **Evergreen**: Ongoing campaigns; `isOnboardingEditable()` returns false, skipping the onboarding edit UI

### Campaigns Have Portal IDs Too
Both `clients` and `campaigns` tables have `portal_id`. This allows deep-linking directly to a campaign page without knowing the client's portal ID.

### ID Generation
All IDs are generated via `genId()` in `lib/db/mutations.ts` using nanoid with a custom alphabet. Portal IDs are 12 characters; internal IDs use a longer length.

### Cron Security
All cron endpoints check for `Authorization: Bearer <CRON_SECRET>`. Never expose cron routes without this check.
