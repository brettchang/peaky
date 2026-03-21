import { getAppBaseUrl } from "@/lib/urls";
import { EMAIL_MAILBOX_ADDRESS } from "./constants";

export function getNylasApiBaseUrl(): string {
  return (process.env.NYLAS_API_BASE_URL?.trim() || "https://api.us.nylas.com").replace(/\/$/, "");
}

export function getNylasConfig() {
  const apiKey = process.env.NYLAS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing required environment variable: NYLAS_API_KEY");
  }

  const apiUri = getNylasApiBaseUrl();
  const clientId = process.env.NYLAS_CLIENT_ID?.trim() || "";
  const callbackUri =
    process.env.NYLAS_CALLBACK_URI?.trim() || `${getAppBaseUrl()}/api/email/auth/callback`;
  const webhookSecret = process.env.NYLAS_WEBHOOK_SECRET?.trim();

  return {
    apiKey,
    apiUri,
    clientId,
    callbackUri,
    webhookSecret,
    grantId: process.env.NYLAS_GRANT_ID?.trim(),
    accountId: process.env.NYLAS_ACCOUNT_ID?.trim(),
    mailboxAddress: process.env.EMAIL_MAILBOX_ADDRESS?.trim() || EMAIL_MAILBOX_ADDRESS,
  };
}

export function getInternalEmailDomains(): string[] {
  return (process.env.EMAIL_AGENT_INTERNAL_DOMAINS || "thepeakmediaco.com,readthepeak.com")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}
