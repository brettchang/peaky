# Peak Client Portal

## Project Overview

A client-facing web portal where The Peak's advertising clients can review and approve ad copy, track revision history, and monitor campaign performance — all via a unique URL with no login required.

Internally, the portal also serves as the team's campaign management dashboard, replacing manual copy-pasting between Claude, Google Docs, Notion, and Beehiiv.

---

## The Core Concept: URL = Identity

Each client gets a permanent unique link:
```
yourapp.com/portal/[unique-client-id]
```

No accounts. No passwords. The URL is their credential. It maps to a client record in Notion that links to all their campaigns. They bookmark it and return to it for every campaign.

---

## Current Workflow (What We're Replacing)

1. Client fills out onboarding form → creates a Notion campaign + Google Doc
2. Team manually prompts Claude to generate ad copy
3. Team copies copy into Google Doc, sends for client approval
4. Client fills out a separate form to approve or request edits
5. Team puts approved copy in the Notion ad calendar
6. Team copies copy from Notion into Beehiiv manually

## Target Workflow

1. Onboarding form webhook → auto-creates Notion campaign, triggers Claude copy generation
2. Team reviews generated copy in internal dashboard, then sends client their portal link
3. Client visits their portal, reviews copy, approves or leaves revision notes
4. On approval → copy auto-pushes to Notion ad calendar
5. One-click publish to Beehiiv from the internal dashboard
6. Performance data from Beehiiv surfaces automatically in the client's portal

---

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS
- **Database:** Notion (via Notion API) — no separate DB needed
- **APIs:**
  - Notion API (campaigns database + ad calendar + client records)
  - Anthropic API (copy generation)
  - Beehiiv API (publishing + performance data)
  - Google Drive API (reading onboarding docs)

---

## Project Structure

```
/app
  /portal/[clientId]                  # Client portal home — all their campaigns
  /portal/[clientId]/[campaignId]     # Individual campaign — copy review + performance
  /dashboard                          # Internal team view — all campaigns across all clients
  /dashboard/[campaignId]             # Internal campaign management page
  /api
    /generate-copy                    # POST: triggers Claude to generate copy
    /approve                          # POST: client approves copy
    /revise                           # POST: client submits revision notes
    /publish-beehiiv                  # POST: pushes approved copy to Beehiiv as draft
    /webhook/onboarding               # POST: receives new campaign form submissions
/lib
  /notion.ts                          # Notion API client + helpers
  /anthropic.ts                       # Claude copy generation logic
  /beehiiv.ts                         # Beehiiv API client (publishing + stats)
  /google-drive.ts                    # Google Drive fetching helpers
  /client-ids.ts                      # Client ID generation + validation
/components
  /CampaignCard.tsx                   # Used on portal home + dashboard
  /CopyReview.tsx                     # The copy display + approve/revise UI
  /RevisionHistory.tsx                # Shows v1, v2, v3 of copy with change context
  /PerformanceStats.tsx               # Key metrics pulled from Beehiiv
  /StatusBadge.tsx                    # Campaign status pill
  /ConfirmationScreen.tsx             # Shown after client approves or submits revisions
```

---

## Screens

### Screen 1 — Client Portal Home `/portal/[clientId]`
The client's home base. Shows all their campaigns as cards.

Each card displays:
- Campaign name
- Status badge (Copy Ready for Review / Revisions Requested / Approved / Live)
- Date created or published

Clicking a card goes to the campaign page. Clean and minimal — no extra chrome.

### Screen 2 — Campaign Page `/portal/[clientId]/[campaignId]`
The main interaction screen. Two states depending on campaign status:

**If copy is pending review:**
- Displays ad copy in clean, readable format (not an editor)
- Two actions: **Approve** button, or a text area to leave revision notes + **Submit** button
- After either action: show a confirmation screen, update Notion status
- If there have been multiple rounds, show a collapsible revision history (v1, v2, v3) so the client can see what changed

**If campaign is live:**
- Shows the published copy
- Shows performance stats pulled from Beehiiv: open rate, click rate, impressions
- No charts needed for MVP — a clean stat display is enough

### Screen 3 — Internal Dashboard `/dashboard`
Team-only view (protected with simple env-based password for now).

Lists all campaigns across all clients with:
- Client name, campaign name, status
- "Copy Portal Link" button (copies the client's unique URL to clipboard)
- "Regenerate Copy" button
- "Publish to Beehiiv" button (only active when status = Approved)

---

## Notion Database Schema

### Clients Database (new — needs to be created)
| Property | Type | Notes |
|---|---|---|
| Name | title | Client/company name |
| Portal ID | rich_text | Unique ID used in the URL |
| Campaigns | relation | Links to Campaigns database |

### Campaigns Database (existing)
Campaign names follow the format: `[Company Name] [4-digit number]` (e.g., "Felix Health 1646")

Additional properties to add:
| Property | Type | Notes |
|---|---|---|
| Name | title | Campaign name (existing) |
| Client | relation | Links to Clients database |
| Status | select | Draft / Copy Ready / Revisions Requested / Approved / Published |
| Current Copy | rich_text | Latest version of generated copy |
| Revision Notes | rich_text | Client's most recent feedback |
| Copy Version | number | Increments each time copy is regenerated |
| Onboarding Doc URL | url | Link to Google Doc |
| Beehiiv Post ID | rich_text | Stored after publishing, used to fetch stats |

### Ad Calendar Database (existing)
When copy is approved, write to the ad calendar. Fetch the database schema first to confirm exact property names before writing.

---

## Client ID Generation

Portal IDs should be short, unguessable, and human-copyable. Use nanoid with a custom alphabet:

```ts
// lib/client-ids.ts
import { customAlphabet } from 'nanoid'

// No ambiguous characters (0/O, 1/l/I)
const nanoid = customAlphabet('23456789abcdefghjkmnpqrstuvwxyz', 12)

export function generatePortalId(): string {
  return nanoid()
}
```

Store the Portal ID in the Clients database in Notion. Look it up on every request to `/portal/[clientId]` — if no matching client found, show a friendly 404.

---

## Environment Variables

```
NOTION_API_KEY=
NOTION_CLIENTS_DB_ID=
NOTION_CAMPAIGNS_DB_ID=
NOTION_AD_CALENDAR_DB_ID=
ANTHROPIC_API_KEY=
BEEHIIV_API_KEY=
BEEHIIV_PUBLICATION_ID=
GOOGLE_SERVICE_ACCOUNT_JSON=
NEXT_PUBLIC_BASE_URL=        # e.g., https://your-app.vercel.app
DASHBOARD_PASSWORD=          # Simple password to protect /dashboard for now
```

---

## Implementation Notes

### Notion as the Source of Truth
All state lives in Notion. The app is a UI layer on top of Notion data. This means:
- Always fetch fresh data from Notion on page load (or use short-lived cache)
- Write status changes back to Notion immediately on client action
- Don't maintain local state that could drift from Notion

### Copy Versioning
When copy is regenerated after revision notes, increment the `Copy Version` number and save the previous version (appended to the Notion page body) so revision history is preserved and displayable in the portal.

### Beehiiv Publishing
Always create as a **draft** in Beehiiv, never publish directly. Store the returned Beehiiv post ID in the campaign's Notion record so performance stats can be fetched later.

### Performance Stats
Pull stats from the Beehiiv API using the stored post ID. Cache these for ~1 hour — no need to hit Beehiiv on every page load.

### Dashboard Auth
Protect `/dashboard` with a simple Next.js middleware check against a `DASHBOARD_PASSWORD` env var stored in a cookie. Don't over-engineer this — the client portal needs no auth at all, and the dashboard just needs to not be publicly accessible.

---

## Build Order (Phase by Phase)

### Phase 1 — Client Campaign Page (build this first)
**Route:** `/portal/[clientId]/[campaignId]`

The highest-value, most self-contained piece. Build it against a hardcoded mock campaign in Notion first, then wire up the real lookup.

Acceptance criteria:
- [ ] Displays campaign copy clearly formatted
- [ ] Approve button → Notion status updates to "Approved" + confirmation screen shown
- [ ] Revision notes text area + Submit → Notion status updates to "Revisions Requested", notes saved
- [ ] Invalid client/campaign ID shows a friendly error page
- [ ] No re-submission possible after action is taken

### Phase 2 — Client Portal Home
**Route:** `/portal/[clientId]`

- [ ] Lists all campaigns for the client as cards
- [ ] Each card shows name, status badge, date
- [ ] Clicking a card navigates to the campaign page
- [ ] Unknown client ID shows a friendly 404

### Phase 3 — Internal Dashboard
**Route:** `/dashboard`

- [ ] Password-protected via Next.js middleware
- [ ] Lists all campaigns across all clients
- [ ] "Copy Portal Link" button per client
- [ ] Status badges + basic filtering (All / Pending / Approved / Published)
- [ ] "Publish to Beehiiv" button on approved campaigns (creates Beehiiv draft)

### Phase 4 — Claude Copy Generation
- [ ] Fetch onboarding Google Doc content
- [ ] Extract structured form responses
- [ ] Send to Anthropic API with a well-structured system prompt (prompt lives in `/lib/anthropic.ts` for easy iteration)
- [ ] Save generated copy to Notion, set status to "Copy Ready"
- [ ] "Regenerate" increments version number, preserves previous copy

### Phase 5 — Performance Stats
- [ ] Fetch stats from Beehiiv API using stored post ID
- [ ] Display open rate, click rate, impressions on the campaign page when status = Published
- [ ] Cache stats server-side for 1 hour
