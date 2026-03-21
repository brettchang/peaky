# Peak Client Portal MCP Server

This repository now includes an MCP server at `mcp-server/index.ts` that exposes core campaign operations over Streamable HTTP.

## Tools Included

- `list_campaigns`
- `get_campaign`
- `create_campaign`
- `update_placement_status`

## Local Run

1. Install dependencies:
   - `npm install`
2. Start the MCP server:
   - `npm run mcp:start`
3. Health check:
   - `GET http://localhost:3000/healthz`
4. MCP endpoint:
   - `POST http://localhost:3000/mcp`

## Authentication

- Set `MCP_API_KEY` to require bearer auth.
- Clients must send:
  - `Authorization: Bearer <MCP_API_KEY>`

If `MCP_API_KEY` is unset, the server allows unauthenticated access (suitable only for local development).

## Railway Deployment

Configure a Railway service from this repo with:

- Start command: `npm run mcp:start`
- Healthcheck path: `/healthz`
- Required env vars:
  - `POSTGRES_URL` (or the DB vars your `@vercel/postgres` setup uses)
  - `MCP_API_KEY` (recommended)
  - Any other app env vars required by your DB/runtime

After deploy, your MCP URL is:

- `https://<railway-domain>/mcp`
