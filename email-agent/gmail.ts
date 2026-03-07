import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { EmailMessage, EmailThread } from "./types";

const execFileAsync = promisify(execFile);
const DEFAULT_GWS_LOCAL_BIN = "node_modules/.bin/gws";
const GWS_RUNTIME_HOME = "/tmp/gws-home";
const GWS_XDG_CONFIG_HOME = path.join(GWS_RUNTIME_HOME, ".config");
const GWS_CONFIG_DIR = path.join(GWS_XDG_CONFIG_HOME, "gws");
const GWS_CREDENTIALS_FILE = "/tmp/gws/credentials.json";
const GWS_PLAINTEXT_CREDENTIALS_FILE = path.join(
  GWS_CONFIG_DIR,
  "credentials.json"
);
const GWS_CLIENT_SECRET_FILE = path.join(GWS_CONFIG_DIR, "client_secret.json");
const DEFAULT_UNREAD_QUERY = "is:unread";
const DEFAULT_MAX_RESULTS = 20;

let gwsRuntimePrepared = false;
let gwsCredentialsFilePath: string | null = null;

// ─── Gmail API types ─────────────────────────────────────────

interface GmailListThreadsResponse {
  threads?: Array<{ id?: string; snippet?: string }>;
}

interface GmailThreadResponse {
  id?: string;
  messages?: GmailMessage[];
}

interface GmailMessage {
  id?: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailPayload;
}

interface GmailPayload {
  mimeType?: string;
  headers?: Array<{ name?: string; value?: string }>;
  body?: { data?: string };
  parts?: GmailPayload[];
}

interface GmailDraftCreateResponse {
  id?: string;
  message?: { id?: string; threadId?: string };
}

// ─── gws CLI helpers (reused from campaign-email-insights.ts) ─

function resolveGmailUserId(): string {
  return (
    process.env.CAMPAIGN_EMAIL_GMAIL_USER_ID?.trim() ||
    process.env.CAMPAIGN_EMAIL_GMAIL_ACCOUNT?.trim() ||
    "adops@thepeakmediaco.com"
  );
}

async function resolveGwsRuntimeConfig(): Promise<{
  command: string;
  argsPrefix: string[];
  env: NodeJS.ProcessEnv;
}> {
  const env: NodeJS.ProcessEnv = { ...process.env };

  if (isHostedRuntime()) {
    await mkdir(GWS_RUNTIME_HOME, { recursive: true });
    await mkdir(GWS_XDG_CONFIG_HOME, { recursive: true });
    await mkdir(GWS_CONFIG_DIR, { recursive: true });
    env.HOME = GWS_RUNTIME_HOME;
    env.XDG_CONFIG_HOME = GWS_XDG_CONFIG_HOME;
    env.GOOGLE_WORKSPACE_CLI_CONFIG_DIR = GWS_CONFIG_DIR;
  }

  await ensureGwsCredentialsFromEnv(env);

  const explicitBin = process.env.GOOGLE_WORKSPACE_CLI_BIN?.trim();
  if (explicitBin) {
    return { command: explicitBin, argsPrefix: [], env };
  }

  const localBin = path.join(process.cwd(), DEFAULT_GWS_LOCAL_BIN);
  if (existsSync(localBin)) {
    return { command: localBin, argsPrefix: [], env };
  }

  const runGwsPath = path.join(
    process.cwd(),
    "node_modules/@googleworkspace/cli/run-gws.js"
  );
  if (existsSync(runGwsPath)) {
    return { command: process.execPath, argsPrefix: [runGwsPath], env };
  }

  return { command: "gws", argsPrefix: [], env };
}

async function ensureGwsCredentialsFromEnv(
  env: NodeJS.ProcessEnv
): Promise<void> {
  if (gwsCredentialsFilePath) {
    env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE = gwsCredentialsFilePath;
    env.GOOGLE_APPLICATION_CREDENTIALS = gwsCredentialsFilePath;
  }
  if (gwsRuntimePrepared) return;

  const encoded =
    process.env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON_B64?.trim();
  if (!encoded) {
    gwsRuntimePrepared = true;
    return;
  }

  const normalized = encoded.replace(/\s+/g, "").replace(/^['"]|['"]$/g, "");
  let decoded = normalized;

  if (!normalized.startsWith("{")) {
    try {
      decoded = Buffer.from(normalized, "base64").toString("utf8");
    } catch {
      decoded = normalized;
    }
  }

  if (!decoded.trim().startsWith("{")) {
    try {
      const uriDecoded = decodeURIComponent(decoded);
      if (uriDecoded.trim().startsWith("{")) decoded = uriDecoded;
    } catch {
      // Keep current decoded value.
    }
  }

  try {
    JSON.parse(decoded);
  } catch {
    throw new Error(
      "GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON_B64 is not valid JSON or base64-encoded JSON."
    );
  }

  await mkdir(path.dirname(GWS_CREDENTIALS_FILE), { recursive: true });
  await mkdir(GWS_CONFIG_DIR, { recursive: true });
  await writeFile(GWS_CREDENTIALS_FILE, decoded, {
    encoding: "utf8",
    mode: 0o600,
  });
  await writeFile(GWS_PLAINTEXT_CREDENTIALS_FILE, decoded, {
    encoding: "utf8",
    mode: 0o600,
  });

  const clientId = process.env.GOOGLE_WORKSPACE_CLI_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_WORKSPACE_CLI_CLIENT_SECRET?.trim();
  if (clientId && clientSecret) {
    await writeFile(
      GWS_CLIENT_SECRET_FILE,
      JSON.stringify(
        {
          installed: {
            client_id: clientId,
            client_secret: clientSecret,
            auth_uri: "https://accounts.google.com/o/oauth2/auth",
            token_uri: "https://oauth2.googleapis.com/token",
            redirect_uris: ["http://localhost"],
          },
        },
        null,
        2
      ),
      {
        encoding: "utf8",
        mode: 0o600,
      }
    );
  }

  gwsCredentialsFilePath = GWS_CREDENTIALS_FILE;
  env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE = gwsCredentialsFilePath;
  env.GOOGLE_APPLICATION_CREDENTIALS = gwsCredentialsFilePath;
  gwsRuntimePrepared = true;
}

async function runGwsJson<T>(args: string[]): Promise<T> {
  const { command, argsPrefix, env } = await resolveGwsRuntimeConfig();
  try {
    const { stdout } = await execFileAsync(command, [...argsPrefix, ...args], {
      timeout: 120_000,
      maxBuffer: 1024 * 1024 * 10,
      env,
    });
    return parseJsonOutput<T>(stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stderr =
      typeof error === "object" &&
      error !== null &&
      "stderr" in error &&
      typeof (error as { stderr?: unknown }).stderr === "string"
        ? (error as { stderr: string }).stderr.trim()
        : "";
    const stdout =
      typeof error === "object" &&
      error !== null &&
      "stdout" in error &&
      typeof (error as { stdout?: unknown }).stdout === "string"
        ? (error as { stdout: string }).stdout.trim()
        : "";
    const hint =
      " For Railway, GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON_B64 must contain the exported output of `gws auth export --unmasked`, not just the OAuth client secret JSON.";
    throw new Error(
      `Google Workspace CLI command failed: ${message}${stderr ? ` | stderr: ${stderr}` : ""}${stdout ? ` | stdout: ${stdout}` : ""}${hint}`
    );
  }
}

function isHostedRuntime(): boolean {
  return Boolean(
    process.env.RAILWAY_ENVIRONMENT ||
      process.env.RAILWAY_PROJECT_ID ||
      process.env.VERCEL === "1"
  );
}

function parseJsonOutput<T>(stdout: string): T {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("Google Workspace CLI returned empty output.");
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const extracted = extractFirstJsonBlob(trimmed);
    if (extracted) {
      try {
        return JSON.parse(extracted) as T;
      } catch {
        // Continue to line-by-line fallback.
      }
    }

    const lines = trimmed
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      if (!line.startsWith("{") && !line.startsWith("[")) continue;
      try {
        return JSON.parse(line) as T;
      } catch {
        // Continue scanning.
      }
    }
    throw new Error("Unable to parse JSON output from Google Workspace CLI.");
  }
}

function extractFirstJsonBlob(value: string): string | null {
  const start = Math.min(
    ...[value.indexOf("{"), value.indexOf("[")].filter((idx) => idx >= 0)
  );
  if (!Number.isFinite(start) || start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < value.length; i += 1) {
    const char = value[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{" || char === "[") {
      depth += 1;
      continue;
    }
    if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) return value.slice(start, i + 1);
    }
  }

  return null;
}

// ─── Gmail message parsing helpers ───────────────────────────

function headerValue(message: GmailMessage, name: string): string {
  const headers = message.payload?.headers ?? [];
  const header = headers.find(
    (row) => row.name?.toLowerCase() === name.toLowerCase()
  );
  return (header?.value ?? "").trim();
}

function resolveMessageDate(message: GmailMessage): Date | null {
  if (message.internalDate) {
    const parsed = Number(message.internalDate);
    if (!Number.isNaN(parsed)) return new Date(parsed);
  }
  const headerDate = headerValue(message, "Date");
  if (!headerDate) return null;
  const parsed = new Date(headerDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function extractBodyText(payload: GmailPayload | undefined): string {
  if (!payload) return "";
  const mimeType = payload.mimeType?.toLowerCase() || "";

  if (mimeType.includes("text/plain") && payload.body?.data) {
    return decodeBodyData(payload.body.data);
  }

  if (payload.parts && payload.parts.length > 0) {
    const plainPart = payload.parts.find((part) =>
      (part.mimeType || "").toLowerCase().includes("text/plain")
    );
    if (plainPart) {
      const fromPlain = extractBodyText(plainPart);
      if (fromPlain) return fromPlain;
    }
    for (const part of payload.parts) {
      const nested = extractBodyText(part);
      if (nested) return nested;
    }
  }

  if (mimeType.includes("text/html") && payload.body?.data) {
    return stripHtml(decodeBodyData(payload.body.data));
  }

  if (payload.body?.data) {
    return decodeBodyData(payload.body.data);
  }

  return "";
}

function decodeBodyData(value: string): string {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(base64, "base64")
      .toString("utf8")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "";
  }
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function extractEmail(value: string): string {
  const angle = value.match(/<([^>]+)>/);
  if (angle?.[1]) return angle[1].trim();
  const plain = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return plain?.[0]?.trim() ?? "";
}

// ─── Public Gmail operations ─────────────────────────────────

export async function fetchUnreadThreads(): Promise<string[]> {
  const unreadQuery =
    process.env.EMAIL_AGENT_UNREAD_QUERY?.trim() || DEFAULT_UNREAD_QUERY;
  const maxResultsRaw = Number(process.env.EMAIL_AGENT_MAX_THREADS ?? "");
  const maxResults =
    Number.isFinite(maxResultsRaw) && maxResultsRaw > 0
      ? Math.min(Math.floor(maxResultsRaw), 100)
      : DEFAULT_MAX_RESULTS;

  const params = {
    userId: resolveGmailUserId(),
    q: unreadQuery,
    maxResults,
  };

  try {
    const payload = await runGwsJson<GmailListThreadsResponse>([
      "gmail",
      "users",
      "threads",
      "list",
      "--params",
      JSON.stringify(params),
      "--format",
      "json",
    ]);
    return (payload.threads ?? [])
      .map((t) => t.id?.trim() || "")
      .filter(Boolean);
  } catch (error) {
    if (params.userId === "me") throw error;
    const fallbackPayload = await runGwsJson<GmailListThreadsResponse>([
      "gmail",
      "users",
      "threads",
      "list",
      "--params",
      JSON.stringify({ ...params, userId: "me" }),
      "--format",
      "json",
    ]);
    return (fallbackPayload.threads ?? [])
      .map((t) => t.id?.trim() || "")
      .filter(Boolean);
  }
}

export async function getThreadDetail(
  threadId: string
): Promise<GmailThreadResponse> {
  const params = {
    userId: resolveGmailUserId(),
    id: threadId,
    format: "full",
  };

  try {
    return await runGwsJson<GmailThreadResponse>([
      "gmail",
      "users",
      "threads",
      "get",
      "--params",
      JSON.stringify(params),
      "--format",
      "json",
    ]);
  } catch (error) {
    if (params.userId === "me") throw error;
    return runGwsJson<GmailThreadResponse>([
      "gmail",
      "users",
      "threads",
      "get",
      "--params",
      JSON.stringify({ ...params, userId: "me" }),
      "--format",
      "json",
    ]);
  }
}

export function parseThread(thread: GmailThreadResponse): EmailThread {
  const messages: EmailMessage[] = (thread.messages ?? [])
    .map((msg) => {
      const from = headerValue(msg, "From");
      const to = headerValue(msg, "To");
      const subject = headerValue(msg, "Subject");
      const date = resolveMessageDate(msg);
      const fromEmail = extractEmail(from).toLowerCase();
      const bodyText = extractBodyText(msg.payload);

      if (!fromEmail || !date) return null;

      return {
        id: msg.id ?? "",
        threadId: thread.id ?? "",
        from,
        fromEmail,
        to,
        subject,
        bodyText,
        snippet: msg.snippet?.trim() ?? "",
        date,
      };
    })
    .filter((m): m is EmailMessage => m !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return { id: thread.id ?? "", messages };
}

export async function createReplyDraft(
  threadId: string,
  to: string,
  subject: string,
  htmlBody: string
): Promise<string | undefined> {
  const userId = resolveGmailUserId();

  // Build RFC 2822 message
  const replySubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;
  const boundary = `boundary_${Date.now()}`;
  const rawMessage = [
    `From: ${userId}`,
    `To: ${to}`,
    `Subject: ${replySubject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    ``,
    htmlBody,
    ``,
    `--${boundary}--`,
  ].join("\r\n");

  const encodedMessage = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const params = {
    userId,
    requestBody: {
      message: {
        raw: encodedMessage,
        threadId,
      },
    },
  };

  const result = await runGwsJson<GmailDraftCreateResponse>([
    "gmail",
    "users",
    "drafts",
    "create",
    "--params",
    JSON.stringify(params),
    "--format",
    "json",
  ]);

  return result.id;
}

export async function markThreadRead(threadId: string): Promise<void> {
  const params = {
    userId: resolveGmailUserId(),
    id: threadId,
    requestBody: {
      removeLabelIds: ["UNREAD"],
    },
  };

  try {
    await runGwsJson([
      "gmail",
      "users",
      "threads",
      "modify",
      "--params",
      JSON.stringify(params),
      "--format",
      "json",
    ]);
  } catch {
    // Non-critical — don't fail the pipeline if marking read fails.
  }
}
