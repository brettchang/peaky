import { EMAIL_MAILBOX_ADDRESS } from "./constants";

const DISABLED_NYLAS_CONFIG = {
  apiKey: "",
  apiUri: "https://api.us.nylas.com",
  clientId: "",
  callbackUri: "",
  webhookSecret: undefined,
  grantId: undefined,
  accountId: undefined,
  mailboxAddress: EMAIL_MAILBOX_ADDRESS,
};

export function getNylasApiBaseUrl(): string {
  return DISABLED_NYLAS_CONFIG.apiUri;
}

export function getNylasConfig() {
  return DISABLED_NYLAS_CONFIG;
}

export function getInternalEmailDomains(): string[] {
  return (process.env.EMAIL_AGENT_INTERNAL_DOMAINS || "thepeakmediaco.com,readthepeak.com")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}
