# Email Agent Deployment (Railway)

This agent is intended to run as a separate always-on worker and should be deployed as its own Railway service.

## Isolation Rules

- Keep the main portal on Vercel.
- Do not point the existing Railway service (if any) at this process.
- Create a new Railway service named `email-agent` (or similar).

## Railway Service Setup

1. Create a new service from this repo.
2. Set builder to Dockerfile and set Dockerfile path to `email-agent/Dockerfile`.
3. Set health check path to `/healthz`.
4. Set restart policy to `on_failure`.
5. Deploy.

## Required Environment Variables

- `POSTGRES_URL` (or your existing DB envs used by `lib/db`)
- `GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON_B64`
- `CAMPAIGN_EMAIL_GMAIL_USER_ID` (or `CAMPAIGN_EMAIL_GMAIL_ACCOUNT`)
- `ANTHROPIC_API_KEY`

## Recommended Environment Variables

- `EMAIL_AGENT_INTERNAL_DOMAINS=thepeakmediaco.com`
- `EMAIL_AGENT_UNREAD_QUERY=is:unread`
- `EMAIL_AGENT_MAX_THREADS=20`
- `POLL_INTERVAL_MS=300000`
- `EMAIL_AGENT_MARK_READ=true`
- `EMAIL_AGENT_CREATE_DRAFTS=true`
- `SLACK_WEBHOOK_URL` (or `SLACK_BOT_TOKEN` + `SLACK_CHANNEL_ID`)

## Safe Rollout

1. First deploy with `EMAIL_AGENT_CREATE_DRAFTS=false` and verify logs.
2. Confirm matching quality and Slack notifications.
3. Switch to `EMAIL_AGENT_CREATE_DRAFTS=true`.
4. If desired, keep `EMAIL_AGENT_MARK_READ=false` for the first day, then enable.
