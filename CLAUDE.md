# Peak Client Portal

## Project Overview

A client-facing web portal where The Peak's advertising clients can review and approve ad copy, track revision history, and monitor campaign performance — all via a unique URL with no login required.

Internally, the portal also serves as the team's campaign management dashboard for managing campaigns, placements, onboarding, invoicing, and Beehiiv publishing.

**Production URL:** `https://peaky-ten.vercel.app`

---

## The Core Concept: URL = Identity

Each client gets a permanent unique link:
```
peaky-ten.vercel.app/portal/[unique-client-id]
```

No accounts. No passwords. The URL is their credential. Portal IDs are 12-char nanoid strings using a custom alphabet (no ambiguous characters like 0/O, 1/l/I). Clients bookmark the link and return to it for every campaign.

---

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript 5
- **Styling:** Tailwind CSS 3.4
- **Database:** PostgreSQL (Neon) via `@vercel/postgres` + Drizzle ORM
- **Hosting:** Vercel
- **Rich Text Editor:** Tiptap (with markdown support)
- **File Storage:** Vercel Blob
- **Integrations:**
  - Beehiiv API (publishing drafts + fetching performance stats)
  - Xero API (OAuth 2.0 invoice management)
  - Fillout Forms (webhook for onboarding + billing data collection)

---

## Database Schema (PostgreSQL via Drizzle)

All state lives in PostgreSQL. Schema is defined in `lib/db/schema.ts`, queries in `lib/db/queries.ts`, mutations in `lib/db/mutations.ts`.

### Tables

**`clients`** — Client accounts
- `id`, `name`, `portal_id` (unique, used in URLs)

**`campaigns`** — Campaign metadata
- `id`, `name`, `client_id` (FK), `status` (CampaignStatus), `campaign_manager`, `contact_name`, `contact_email`
- `ad_line_items` (JSONB), `placements_description`, `performance_table_url`, `notes`, `created_at`

**`placements`** — Individual ad placements within a campaign
- `id`, `campaign_id` (FK), `name`, `type` (PlacementType), `publication` (Publication)
- `scheduled_date`, `status` (PlacementStatus), `current_copy`, `copy_version`
- `revision_notes`, `onboarding_round_id`, `copy_producer` ("Us" | "Client")
- `stats` (JSONB PerformanceStats), `image_url`, `logo_url`, `link_to_placement`
- `conflict_preference`, `beehiiv_post_id`, `created_at`, `published_at`

**`copy_versions`** — Revision history for placement copy
- `id`, `placement_id` (FK), `version`, `copy_text`, `revision_notes`, `created_at`
- Unique constraint on (placement_id, version)

**`onboarding_rounds`** — Form submission rounds per campaign
- `id`, `campaign_id` (FK), `label`, `fillout_link`, `complete`, `onboarding_doc_url`, `created_at`

**`billing_onboarding`** — Billing form data per campaign
- `id`, `campaign_id` (FK, unique), `fillout_link`, `complete`, `completed_at`
- `billing_contact_name`, `billing_contact_email`, `billing_address`, `po_number`
- `invoice_cadence` (JSONB: "lump-sum" | "equal-monthly" | "per-month-usage"), `special_instructions`, `uploaded_doc_url`

**`xero_connections`** — OAuth token storage for Xero
- `id`, `tenant_id`, `tenant_name`, `access_token`, `refresh_token`, `expires_at`

**`campaign_invoices`** — Links Xero invoices to campaigns
- `id`, `campaign_id` (FK), `xero_invoice_id`, `linked_at`, `notes`

**`placement_invoices`** — Links Xero invoices to placements
- `id`, `placement_id` (FK), `xero_invoice_id`, `linked_at`, `notes`

### Key Enums

**PlacementStatus:** `"New Campaign"` | `"Onboarding Requested"` | `"Copywriting in Progress"` | `"Peak Team Review Complete"` | `"Sent for Approval"` | `"Approved"` | `"Debrief Needed"` | `"Send Debrief"` | `"Client Missed Placement"` | `"Hold"` | `"Done"`

**CampaignStatus:** `"Waiting on Onboarding"` | `"Onboarding Form Complete"` | `"Active"` | `"Placements Completed"` | `"Wrapped"`

**PlacementType:** `"Primary"` | `"Secondary"` | `"Peak Picks"` | `"Beehiv"` | `"Smart Links"` | `"BLS"` | `"Podcast Ad"`

**Publication:** `"The Peak"` | `"Peak Money"`

---

## Project Structure

```
/app
  /portal
    /[clientId]/page.tsx                           # Client home — all their campaigns
    /[clientId]/[campaignId]/page.tsx               # Campaign — all placements
    /[clientId]/[campaignId]/[placementId]/page.tsx # Placement detail — approval UI + stats
  /dashboard
    /page.tsx                                       # Internal dashboard (table + calendar views)
    /[campaignId]/page.tsx                          # Campaign admin (placements list, metadata)
    /[campaignId]/[placementId]/page.tsx            # Placement admin (copy editor, invoices, stats)
    /login/page.tsx                                 # Dashboard login form
    /invoicing/page.tsx                             # Invoice management
  /api
    /approve/route.ts                # Client approves placement
    /revise/route.ts                 # Client submits revision notes
    /create-campaign/route.ts        # Create new campaign
    /update-campaign/route.ts        # Update campaign metadata
    /update-placement/route.ts       # Edit placement fields
    /update-copy/route.ts            # Update copy (increments version)
    /update-schedule/route.ts        # Set scheduled_date
    /add-placement/route.ts          # Create new placement
    /bulk-schedule/route.ts          # Bulk assign dates to placements
    /schedule-capacity/route.ts      # Check capacity for date range
    /publish-beehiiv/route.ts        # Create Beehiiv draft from approved copy
    /sync-beehiiv-stats/route.ts     # Fetch Beehiiv stats and save to DB
    /create-onboarding-round/route.ts
    /update-placement-round/route.ts
    /update-ad-line-items/route.ts
    /upload-onboarding-doc/route.ts
    /dashboard/login/route.ts        # Dashboard auth
    /webhook/fillout/route.ts        # Fillout form webhook
    /xero/
      /connect/route.ts             # Initiate Xero OAuth
      /callback/route.ts            # OAuth callback
      /disconnect/route.ts          # Clear Xero connection
      /search-invoices/route.ts     # Search Xero invoices
      /link-invoice/route.ts        # Link invoice to campaign/placement
      /unlink-invoice/route.ts      # Remove invoice link

/lib
  /db/
    /index.ts            # DB client export + re-exports
    /schema.ts           # Drizzle table definitions + relations
    /queries.ts          # Read operations
    /mutations.ts        # Write operations
  /types.ts              # Main type definitions
  /beehiiv.ts            # Beehiiv API client (fetch posts, find by URL, extract stats)
  /xero.ts               # Xero API helpers (OAuth, token refresh, invoice fetch)
  /xero-types.ts         # Xero data types
  /client-ids.ts         # Portal ID generation (nanoid)
  /dashboard-auth.ts     # Cookie-based auth helper
  /format-copy.ts        # Copy formatting utilities

/components              # ~25 components
  # Client Portal
  CopyReview.tsx         # Approval/revision UI
  CopyEditor.tsx         # Rich text editor (Tiptap + markdown)
  RevisionHistory.tsx    # Copy version history display
  PerformanceStats.tsx   # Stats display (opens, clicks, etc.)
  StatusBadge.tsx        # Status pill component
  ConfirmationScreen.tsx # Post-action confirmation
  CampaignCard.tsx       # Campaign card for portal home

  # Admin Dashboard
  AdminPlacementDetail.tsx    # Full placement editor (copy, metadata, invoices)
  AdminPlacementList.tsx      # Placement list with inline controls
  CampaignMetadataEditor.tsx  # Campaign info editor
  CreateCampaignForm.tsx      # New campaign form
  DateRangeScheduler.tsx      # Date range picker for bulk scheduling
  AddPlacementForm.tsx        # Create new placement
  OnboardingStatus.tsx        # Onboarding form status + responses
  DashboardTable.tsx          # Campaign table with filtering
  CalendarView.tsx            # Calendar grid view of placements
  DashboardViewToggle.tsx     # Table/calendar toggle
  PlacementDashboard.tsx      # Placement list container
  AdLineItems.tsx             # Ad pricing/item editor

  # Invoicing
  InvoiceLinkModal.tsx        # Modal to search and link Xero invoices
  InvoiceStatusBadge.tsx      # Invoice status indicator
  CampaignInvoiceSection.tsx  # Campaign invoice display
  BillingDetails.tsx          # Billing info display
  XeroConnectButton.tsx       # OAuth button for Xero

/drizzle                 # Migration files
/middleware.ts           # Protects /dashboard routes
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
- Password-protected via middleware + cookie
- Campaign list in table or calendar grid view
- Campaign admin: edit metadata, manage placements, view onboarding status
- Placement admin: edit copy (Tiptap rich text), set metadata, link invoices, sync Beehiiv stats
- Bulk scheduling with per-type daily capacity limits
- Create campaigns and placements

### Beehiiv Integration (`lib/beehiiv.ts`)
- Create drafts from approved copy (never publish directly)
- Fetch posts by ID with expanded stats
- Search posts by URL match (with date window)
- Extract stats: opens, unique opens, open rate, clicks
- Store Beehiiv post ID on placement for future stat lookups

### Xero Invoicing (`lib/xero.ts`)
- Full OAuth 2.0 flow with auto token refresh (5-min buffer)
- Search invoices by term or status
- Link/unlink invoices at campaign or placement level
- Display linked invoice info (amount, due date, status)

### Fillout Form Webhook (`/api/webhook/fillout`)
- Auto-creates onboarding rounds when forms are submitted
- Auto-creates billing onboarding records
- Extracts form fields: placement info, copy producer, billing contact, invoice cadence, etc.

### Capacity Scheduling
- Daily limits per placement type per publication
- Check available slots for date range
- Bulk schedule respecting capacity constraints
- Weekdays only

### Copy Versioning
- Each copy update increments `copy_version`
- Previous versions saved to `copy_versions` table
- Full revision history displayed to clients and admins

---

## Authentication

**Client Portal:** None — the portal ID in the URL is the credential.

**Dashboard:** Simple password-based auth.
- POST to `/api/dashboard/login` with password
- Sets secure HTTP-only cookie (`dashboard_auth`)
- `middleware.ts` checks cookie on all `/dashboard/*` routes
- Unauthenticated users redirected to `/dashboard/login`

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

# Dashboard Auth
DASHBOARD_PASSWORD=

# App
NEXT_PUBLIC_BASE_URL=    # e.g., https://peaky-ten.vercel.app
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
All state lives in PostgreSQL (Neon). The app reads from and writes to the DB directly via Drizzle ORM. No external database dependencies for core state.

### Beehiiv Publishing
Always create as a **draft** in Beehiiv, never publish directly. Store the returned Beehiiv post ID on the placement record so performance stats can be fetched later.

### Xero OAuth
Uses direct API calls (not the xero-node SDK) for serverless compatibility on Vercel. Tokens are stored in the `xero_connections` table and auto-refreshed when within 5 minutes of expiry.

### Dashboard Auth
Simple env-based password stored in a cookie. The client portal needs no auth at all — the dashboard just needs to not be publicly accessible. Don't over-engineer this.
