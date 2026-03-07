This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## MCP Server (Railway)

This repo includes an MCP server at `mcp-server/index.ts` with campaign tools over Streamable HTTP.

- Start locally: `npm run mcp:start`
- MCP endpoint: `POST /mcp`
- Health check: `GET /healthz`

See `mcp-server/README.md` for deployment setup on Railway.

## Email Agent (Railway Worker)

The always-on email agent lives in `email-agent/` and should be deployed as a separate Railway service so it does not affect the portal deployment.

See `email-agent/README.md` for setup and rollout steps.
# peaky

## Campaign Email Insights Cron

This project includes a daily cron endpoint at `/api/cron/campaign-email-insights` that:

- scans Gmail threads associated with campaign contacts,
- checks 3-hour client-response SLA compliance,
- stores a snapshot per campaign, and
- renders it on the admin campaign detail page.

### Required environment

- `CRON_SECRET`: bearer token used by cron endpoints.
- `GOOGLE_WORKSPACE_CLI_BIN`: path to Google Workspace CLI binary (defaults to `node_modules/.bin/gws`, then `gws`).
- `GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON_B64`: base64-encoded OAuth credentials JSON for non-interactive/server runtimes (written to `/tmp/gws/credentials.json` at runtime).
- `CAMPAIGN_EMAIL_GMAIL_USER_ID`: Gmail user to query (default: `adops@thepeakmediaco.com`).
- `CAMPAIGN_EMAIL_WINDOW_DAYS` (optional): lookback window, default `14`.
- `CAMPAIGN_EMAIL_MAX_THREADS` (optional): max threads per campaign, default `12`.
- `CAMPAIGN_EMAIL_MAX_CAMPAIGNS` (optional): max campaigns scanned per run, default `50`.
- `CAMPAIGN_EMAIL_INTERNAL_DOMAINS` (optional): comma-separated internal domains used to detect team replies (default: `thepeakmediaco.com`).
- `OPENAI_API_KEY` (recommended): primary provider for campaign email summaries.
- `CAMPAIGN_EMAIL_OPENAI_MODEL` (optional): OpenAI model for summaries (default: `gpt-4.1-mini`).
- `CAMPAIGN_EMAIL_OPENAI_FALLBACK_MODEL` (optional): backwards-compatible alias for OpenAI model env.
- `ANTHROPIC_COPY_MODEL` (optional): Anthropic model for ad copy generation (default: `claude-sonnet-4-20250514`).

Google Workspace CLI auth must already be configured in the runtime environment. See:
[googleworkspace/cli](https://github.com/googleworkspace/cli)
