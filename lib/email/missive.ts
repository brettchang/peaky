import { createHmac, timingSafeEqual } from "node:crypto";
import { EMAIL_MAILBOX_ADDRESS } from "./constants";

type MissiveRequestInit = Omit<RequestInit, "body"> & {
  body?: unknown;
};

export interface MissiveWebhookPayload {
  rule?: {
    id?: string | number;
    type?: string;
    description?: string;
  };
  comment?: {
    id?: string | number;
    body?: string;
    author?: {
      email?: string;
      name?: string;
    };
  };
  latest_comment?: {
    id?: string | number;
    body?: string;
  };
  conversation?: Record<string, unknown>;
  latest_message?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MissiveMessage {
  id: string;
  subject?: string;
  preview?: string;
  body?: string;
  deliveredAt?: string;
  from: Array<{ email: string; name?: string }>;
  to: Array<{ email: string; name?: string }>;
  cc: Array<{ email: string; name?: string }>;
  bcc: Array<{ email: string; name?: string }>;
  raw: Record<string, unknown>;
}

export interface MissiveConversation {
  id: string;
  subject?: string;
  preview?: string;
  appUrl?: string;
  webUrl?: string;
  draftsCount?: number;
  messagesCount?: number;
  assignees: string[];
  raw: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function mapRecipients(value: unknown): Array<{ email: string; name?: string }> {
  return asArray(value)
    .map((entry) => {
      const record = asRecord(entry);
      const rawEmail =
        typeof record.email === "string"
          ? record.email
          : typeof record.address === "string"
            ? record.address
            : "";
      const email = rawEmail.trim().toLowerCase();
      if (!email) return null;
      return {
        email,
        name: typeof record.name === "string" ? record.name : undefined,
      };
    })
    .filter(Boolean) as Array<{ email: string; name?: string }>;
}

function toIsoDate(value: unknown): string | undefined {
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  if (typeof value === "number") {
    const date = new Date(value > 10_000_000_000 ? value : value * 1000);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  return undefined;
}

function normalizeSignature(signature?: string | null): string | null {
  if (!signature) return null;
  const trimmed = signature.trim();
  return trimmed.startsWith("sha256=") ? trimmed.slice("sha256=".length) : trimmed;
}

export function getMissiveApiBaseUrl(): string {
  return (process.env.MISSIVE_API_BASE_URL?.trim() || "https://public.missiveapp.com/v1").replace(
    /\/$/,
    ""
  );
}

export function getMissiveConfig() {
  const apiToken = process.env.MISSIVE_API_TOKEN?.trim();
  if (!apiToken) {
    throw new Error("Missing required environment variable: MISSIVE_API_TOKEN");
  }

  return {
    apiToken,
    apiBaseUrl: getMissiveApiBaseUrl(),
    webhookSecret: process.env.MISSIVE_WEBHOOK_SECRET?.trim(),
    webhookTriggerPrefix: process.env.MISSIVE_AI_TRIGGER_PREFIX?.trim() || "@ai draft",
    fromEmail: process.env.MISSIVE_FROM_EMAIL?.trim() || EMAIL_MAILBOX_ADDRESS,
    addDraftToInbox: process.env.MISSIVE_ADD_DRAFT_TO_INBOX?.trim() !== "false",
  };
}

async function missiveRequest<T>(path: string, init?: MissiveRequestInit): Promise<T> {
  const { apiBaseUrl, apiToken } = getMissiveConfig();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    body:
      init?.body && typeof init.body !== "string"
        ? JSON.stringify(init.body)
        : (init?.body as BodyInit | undefined),
  });

  const text = await response.text();
  const json = text ? (JSON.parse(text) as T) : ({} as T);
  if (!response.ok) {
    const errorPayload = json as Record<string, unknown>;
    const nestedError = errorPayload.error as Record<string, unknown> | string | undefined;
    const errorMessage =
      (typeof nestedError === "object" && nestedError?.message ? String(nestedError.message) : null) ||
      (typeof nestedError === "string" ? nestedError : null) ||
      (typeof errorPayload.message === "string" ? errorPayload.message : null) ||
      `Missive request failed with status ${response.status}`;
    console.error(`[missive] ${init?.method || "GET"} ${path} failed (${response.status}):`, text);
    throw new Error(errorMessage);
  }
  return json;
}

export function verifyMissiveWebhookSignature(rawBody: string, signature?: string | null): boolean {
  const secret = getMissiveConfig().webhookSecret;
  if (!secret) return true;

  const normalized = normalizeSignature(signature);
  if (!normalized) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(normalized, "utf8");

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

export function normalizeMissiveConversation(rawValue: unknown): MissiveConversation | null {
  const raw = asRecord(rawValue);
  const id = typeof raw.id === "string" || typeof raw.id === "number" ? String(raw.id) : "";
  if (!id) return null;

  return {
    id,
    subject: typeof raw.subject === "string" ? raw.subject : undefined,
    preview: typeof raw.preview === "string" ? raw.preview : undefined,
    appUrl: typeof raw.app_url === "string" ? raw.app_url : undefined,
    webUrl: typeof raw.web_url === "string" ? raw.web_url : undefined,
    draftsCount:
      typeof raw.drafts_count === "number"
        ? raw.drafts_count
        : typeof raw.draft_count === "number"
          ? raw.draft_count
          : undefined,
    messagesCount:
      typeof raw.messages_count === "number"
        ? raw.messages_count
        : typeof raw.message_count === "number"
          ? raw.message_count
          : undefined,
    assignees: asArray(raw.assignees).map((value) => String(value)),
    raw,
  };
}

export function normalizeMissiveMessage(rawValue: unknown): MissiveMessage | null {
  const raw = asRecord(rawValue);
  const id = typeof raw.id === "string" || typeof raw.id === "number" ? String(raw.id) : "";
  if (!id) return null;

  return {
    id,
    subject: typeof raw.subject === "string" ? raw.subject : undefined,
    preview: typeof raw.preview === "string" ? raw.preview : undefined,
    body:
      typeof raw.body === "string"
        ? raw.body
        : typeof raw.body_html === "string"
          ? raw.body_html
          : undefined,
    deliveredAt:
      toIsoDate(raw.delivered_at) ||
      toIsoDate(raw.created_at) ||
      toIsoDate(raw.updated_at) ||
      undefined,
    from: mapRecipients(raw.from_field ?? raw.from_fields ?? raw.from),
    to: mapRecipients(raw.to_fields ?? raw.to),
    cc: mapRecipients(raw.cc_fields ?? raw.cc),
    bcc: mapRecipients(raw.bcc_fields ?? raw.bcc),
    raw,
  };
}

export async function fetchMissiveConversation(conversationId: string): Promise<MissiveConversation> {
  const response = await missiveRequest<{ conversations?: unknown[]; conversation?: unknown }>(
    `/conversations/${conversationId}`
  );
  const conversation =
    normalizeMissiveConversation(response.conversation) ||
    normalizeMissiveConversation(asArray(response.conversations)[0]);
  if (!conversation) {
    throw new Error(`Missive conversation ${conversationId} was not found.`);
  }
  return conversation;
}

export async function fetchMissiveConversationMessages(
  conversationId: string
): Promise<MissiveMessage[]> {
  const response = await missiveRequest<{ messages?: unknown[] }>(
    `/conversations/${conversationId}/messages`
  );
  return asArray(response.messages)
    .map((message) => normalizeMissiveMessage(message))
    .filter(Boolean) as MissiveMessage[];
}

export async function createMissiveDraft(input: {
  conversationId: string;
  subject: string;
  bodyHtml: string;
}): Promise<{ id?: string; raw: Record<string, unknown> }> {
  const config = getMissiveConfig();
  const response = await missiveRequest<Record<string, unknown>>("/drafts", {
    method: "POST",
    body: {
      drafts: {
        conversation: input.conversationId,
        subject: input.subject,
        body: input.bodyHtml,
        from_field: { address: config.fromEmail },
        add_to_inbox: config.addDraftToInbox,
      },
    },
  });

  const data = asRecord(response.draft ?? response);
  return {
    id:
      typeof data.id === "string" || typeof data.id === "number"
        ? String(data.id)
        : undefined,
    raw: response,
  };
}

export async function createMissiveNewDraft(input: {
  to: Array<{ address: string; name?: string }>;
  subject: string;
  bodyHtml: string;
}): Promise<{ id?: string; conversationId?: string; conversationUrl?: string; raw: Record<string, unknown> }> {
  const config = getMissiveConfig();
  const response = await missiveRequest<Record<string, unknown>>("/drafts", {
    method: "POST",
    body: {
      drafts: {
        to_fields: input.to,
        subject: input.subject,
        body: input.bodyHtml,
        from_field: { address: config.fromEmail },
        add_to_inbox: config.addDraftToInbox,
      },
    },
  });

  const data = asRecord(response.draft ?? response);
  const conversationRaw = asRecord(data.conversation ?? {});
  const conversationId =
    typeof conversationRaw.id === "string" || typeof conversationRaw.id === "number"
      ? String(conversationRaw.id)
      : undefined;

  return {
    id: typeof data.id === "string" || typeof data.id === "number" ? String(data.id) : undefined,
    conversationId,
    conversationUrl:
      typeof conversationRaw.app_url === "string"
        ? conversationRaw.app_url
        : typeof conversationRaw.web_url === "string"
          ? conversationRaw.web_url
          : undefined,
    raw: response,
  };
}

export async function createMissivePost(input: {
  conversationId: string;
  markdown: string;
}): Promise<Record<string, unknown>> {
  return missiveRequest<Record<string, unknown>>("/posts", {
    method: "POST",
    body: {
      posts: {
        conversation: input.conversationId,
        markdown: input.markdown,
        notification: {
          title: "AI draft created",
          body: input.markdown,
        },
      },
    },
  });
}
