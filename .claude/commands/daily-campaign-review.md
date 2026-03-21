Run a comprehensive daily review of all Peak campaigns and publish a Notion report with a Slack alert.

## Steps

### 1. Refresh campaign insights
Call `run_campaign_insights` to generate fresh operational insights for all active campaigns. This analyzes placement scheduling, copy status, onboarding, client approvals, and email correspondence.

### 2. Gather campaign data
- Call `list_campaigns` with limit 200 to get all campaigns (exclude status "Wrapped")
- Call `get_dashboard_tasks` to get prioritized action items (client feedback to review, copy needing review, upcoming deadlines, billing tasks)
- Call `get_campaign_invoices` with `onlyMissing: true` to find active campaigns without linked Xero invoices
- Call `list_email_threads` with `needsAttention: true` to find emails needing a response
- Call `list_unlinked_email_threads` to find emails not associated with any campaign

### 3. Get detailed insights for flagged campaigns
For any campaign that has flags (check the list_campaigns response for flag indicators), call `get_campaign_insight` to retrieve the full operational insight including:
- Specific flags with severity (critical/warning)
- Email SLA compliance (overdue responses, last contact date)
- Recommended next steps

### 4. Check Gmail for unanswered emails
Use `gmail_search_messages` to search for recent unread emails in the adops inbox that may need responses. Look for patterns like client replies waiting for follow-up.

### 5. Create the Notion report
Create a new Notion page titled "Daily Campaign Review — [today's date]" in the reports database.

Structure the page with these sections:

**Action Required**
A table of critical flags that need immediate attention:
- Placements running soon without copy
- Campaigns scheduled but not onboarded
- Stale client approvals (5+ days waiting)
- Emails with overdue responses

**Dashboard Tasks**
List all current operational tasks grouped by type:
- Client feedback to review (urgent)
- Copy needing Peak team review
- Upcoming placements awaiting client approval
- Billing/invoicing tasks

**Campaign-by-Campaign Review**
For each active campaign, sorted by number of flags (most urgent first):
- Campaign name, client, status, campaign manager
- Placement summary (X scheduled / Y total, Z approved)
- All operational flags with severity level
- Latest campaign manager note (if any, with author and date)
- Email compliance status (overdue responses, last client contact)
- Recommended next steps
- Link to the campaign dashboard

**Email Inbox Status**
- Emails needing a response: list each with subject, associated campaign, and how long it's been waiting
- Unlinked emails: threads not associated with any campaign — these need a campaign created or the contact added to an existing campaign. List subject, sender, and date.

**Invoicing Gaps**
All active campaigns that have no linked Xero invoices. List campaign name, client, and status.

**Recent Team Notes**
Campaign manager notes from the last 7 days, with the campaign name, note body, author, and date.

### 6. Send Slack notification
Send a message to the team Slack channel with a compact summary:
- Count of critical flags and which campaigns they affect
- Count of warnings
- Count of emails needing response
- Count of unlinked emails
- Count of campaigns without invoices
- Link to the full Notion report
- Link to the dashboard

## Important notes
- Today's date is used for the report title and all date calculations
- The report covers all non-Wrapped campaigns
- Sort campaigns by urgency (critical flags first, then warnings, then clean)
- If a campaign has zero flags and zero issues, include it in the report with a brief "No issues" note — the report should be comprehensive
- Use the dashboard URL format: `https://portal.thepeakmediaco.com/dashboard/{campaignId}` for campaign links
- Keep the Slack message concise — it's just a notification pointing to the Notion doc
