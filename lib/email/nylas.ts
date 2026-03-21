import { createHmac } from "node:crypto";
import { getNylasConfig } from "./config";
import { cleanEmailSnippet, htmlToReadableText } from "./content";
import type {
  EmailNylasMessage,
  EmailNylasThread,
  EmailParticipant,
  EmailRecipient,
} from "./types";

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function mapRecipients(value: unknown, role?: EmailParticipant["role"]): EmailRecipient[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
      if (!email) return null;
      return {
        name: typeof record.name === "string" ? record.name : undefined,
        email,
        ...(role ? { role } : {}),
      };
    })
    .filter(Boolean) as EmailRecipient[];
}

async function nylasRequest<T>(
  path: string,
  init?: Omit<RequestInit, "body"> & {
    query?: Record<string, string | number | undefined>;
    body?: unknown;
  }
): Promise<T> {
  const { apiKey, apiUri } = getNylasConfig();
  const url = new URL(`${apiUri}${path}`);
  for (const [key, value] of Object.entries(init?.query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    body:
      init?.body && typeof init.body !== "string"
        ? JSON.stringify(init.body)
        : (init?.body as BodyInit | null | undefined),
  });

  const text = await response.text();
  const json = text ? (JSON.parse(text) as T) : ({} as T);
  const errorPayload = json as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(
      errorPayload.error?.message || `Nylas request failed with status ${response.status}`
    );
  }
  return json;
}

export function createNylasHostedAuthUrl(state: string): string {
  const { clientId, callbackUri, apiUri, mailboxAddress } = getNylasConfig();
  if (!clientId) {
    throw new Error("Missing required environment variable: NYLAS_CLIENT_ID");
  }
  const url = new URL(`${apiUri}/v3/connect/auth`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callbackUri);
  url.searchParams.set("provider", "google");
  url.searchParams.set("scope", "email.modify,email.send");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("login_hint", mailboxAddress);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeNylasCode(code: string): Promise<Record<string, unknown>> {
  const { clientId, callbackUri } = getNylasConfig();
  return nylasRequest<Record<string, unknown>>("/v3/connect/token", {
    method: "POST",
    body: {
      client_id: clientId,
      redirect_uri: callbackUri,
      code,
      grant_type: "authorization_code",
    },
  });
}

export function verifyNylasWebhookSignature(rawBody: string, signature?: string | null): boolean {
  const secret = getNylasConfig().webhookSecret;
  if (!secret) return true;
  if (!signature) return false;
  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
  return digest === signature;
}

export async function listNylasThreads(
  grantId: string,
  options?: { limit?: number }
): Promise<EmailNylasThread[]> {
  const response = await nylasRequest<{ data?: Record<string, unknown>[] }>(`/v3/grants/${grantId}/threads`, {
    method: "GET",
    query: { limit: options?.limit ?? 50 },
  });
  return asArray(response.data).map((thread) => normalizeThread(thread));
}

export async function searchNylasThreads(input: {
  grantId: string;
  searchQueryNative: string;
  limit?: number;
}): Promise<EmailNylasThread[]> {
  const response = await nylasRequest<{ data?: Record<string, unknown>[] }>(
    `/v3/grants/${input.grantId}/threads`,
    {
      method: "GET",
      query: {
        limit: input.limit ?? 50,
        search_query_native: input.searchQueryNative,
      },
    }
  );
  return asArray(response.data).map((thread) => normalizeThread(thread));
}

export async function listNylasMessagesForThread(
  grantId: string,
  threadId: string
): Promise<EmailNylasMessage[]> {
  const response = await nylasRequest<{ data?: Record<string, unknown>[] }>(`/v3/grants/${grantId}/messages`, {
    method: "GET",
    query: { thread_id: threadId, limit: 100 },
  });
  return asArray(response.data).map((message) => normalizeMessage(message));
}

export async function createNylasDraft(input: {
  grantId: string;
  threadId: string;
  subject: string;
  bodyHtml: string;
  to: EmailRecipient[];
  cc?: EmailRecipient[];
  replyToMessageId?: string;
}): Promise<{ id?: string; raw: Record<string, unknown> }> {
  const payload = {
    subject: input.subject,
    body: input.bodyHtml,
    to: input.to,
    cc: input.cc ?? [],
    reply_to_message_id: input.replyToMessageId,
    thread_id: input.threadId,
  };
  const response = await nylasRequest<Record<string, unknown>>(`/v3/grants/${input.grantId}/drafts`, {
    method: "POST",
    body: payload,
  });
  return {
    id: typeof response.data === "object" && response.data && "id" in response.data
      ? String((response.data as Record<string, unknown>).id)
      : undefined,
    raw: response,
  };
}

export async function sendNylasDraft(input: {
  grantId: string;
  draftId: string;
}): Promise<Record<string, unknown>> {
  return nylasRequest<Record<string, unknown>>(
    `/v3/grants/${input.grantId}/drafts/${input.draftId}`,
    {
      method: "POST",
      body: { send: true },
    }
  );
}

export async function updateNylasDraft(input: {
  grantId: string;
  draftId: string;
  subject: string;
  bodyHtml: string;
}): Promise<Record<string, unknown>> {
  return nylasRequest<Record<string, unknown>>(
    `/v3/grants/${input.grantId}/drafts/${input.draftId}`,
    {
      method: "PUT",
      body: {
        subject: input.subject,
        body: input.bodyHtml,
      },
    }
  );
}

export function normalizeThread(raw: Record<string, unknown>): EmailNylasThread {
  const rawSnippet =
    typeof raw.snippet === "string"
      ? raw.snippet
      : typeof raw.latest_draft_or_message?.toString === "function"
        ? String(raw.latest_draft_or_message)
        : undefined;
  const participants = [
    ...mapRecipients(raw.participants, "to"),
    ...mapRecipients(raw.from, "from"),
  ] as EmailParticipant[];
  return {
    id: String(raw.id ?? ""),
    subject: typeof raw.subject === "string" ? raw.subject : undefined,
    snippet: cleanEmailSnippet(rawSnippet),
    participants,
    latestMessageReceivedDate:
      typeof raw.latest_message_received_date === "number"
        ? raw.latest_message_received_date
        : typeof raw.latest_message_received_timestamp === "number"
          ? raw.latest_message_received_timestamp
          : undefined,
    unread: typeof raw.unread === "boolean" ? raw.unread : true,
    messageIds: Array.isArray(raw.message_ids)
      ? raw.message_ids.map((value) => String(value))
      : undefined,
    raw,
  };
}

export function normalizeMessage(raw: Record<string, unknown>): EmailNylasMessage {
  const bodyHtml = typeof raw.body === "string" ? raw.body : typeof raw.body_html === "string" ? raw.body_html : "";
  const bodyText = htmlToReadableText(bodyHtml);
  return {
    id: String(raw.id ?? ""),
    threadId: String(raw.thread_id ?? raw.threadId ?? ""),
    subject: typeof raw.subject === "string" ? raw.subject : undefined,
    from: mapRecipients(raw.from, "from"),
    to: mapRecipients(raw.to, "to"),
    cc: mapRecipients(raw.cc, "cc"),
    bcc: mapRecipients(raw.bcc, "bcc"),
    date:
      typeof raw.date === "number"
        ? raw.date
        : typeof raw.sent_at === "number"
          ? raw.sent_at
          : undefined,
    body: bodyHtml,
    snippet: cleanEmailSnippet(
      typeof raw.snippet === "string" ? raw.snippet : bodyText.slice(0, 220)
    ),
    unread: typeof raw.unread === "boolean" ? raw.unread : undefined,
    folders: Array.isArray(raw.folders) ? raw.folders.map((value) => String(value)) : undefined,
    raw,
  };
}
