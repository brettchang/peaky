import { NextRequest } from "next/server";
import { getAppBaseUrl } from "./urls";

export const DASHBOARD_COOKIE_NAME = "dashboard_auth";
export const DASHBOARD_OAUTH_STATE_COOKIE_NAME = "dashboard_oauth_state";

const DASHBOARD_SESSION_VERSION = "v2";
const DASHBOARD_OAUTH_STATE_VERSION = "v1";
export const DASHBOARD_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
export const DASHBOARD_OAUTH_STATE_TTL_SECONDS = 60 * 10;

type DashboardSessionPayload = {
  email: string;
  issuedAt: number;
  name?: string;
};

type DashboardOauthStatePayload = {
  issuedAt: number;
  returnTo: string;
  state: string;
};

function getDashboardSessionSecret(): string {
  const secret = process.env.DASHBOARD_SESSION_SECRET;
  if (!secret) {
    throw new Error("Missing DASHBOARD_SESSION_SECRET environment variable");
  }
  return secret;
}

function getDashboardAllowedEmails(): string[] {
  const raw = process.env.DASHBOARD_ALLOWED_EMAILS ?? "";
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + "=".repeat(padLength));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function signDashboardValue(value: string): Promise<string> {
  const secret = getDashboardSessionSecret();
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(value)
  );

  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function createSignedToken(
  version: string,
  payload: Record<string, string | number | undefined>
): Promise<string> {
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const value = `${version}.${encodedPayload}`;
  const signature = await signDashboardValue(value);
  return `${value}.${signature}`;
}

async function parseSignedToken<T extends { issuedAt: number }>(
  token: string | undefined,
  expectedVersion: string,
  ttlSeconds: number
): Promise<T | null> {
  if (!token) return null;

  const [version, encodedPayload, signature] = token.split(".");
  if (!version || !encodedPayload || !signature) return null;
  if (version !== expectedVersion) return null;

  try {
    const expectedSignature = await signDashboardValue(`${version}.${encodedPayload}`);
    if (signature !== expectedSignature) return null;

    const payload = JSON.parse(fromBase64Url(encodedPayload)) as T;
    if (!payload || !Number.isFinite(payload.issuedAt)) return null;

    const now = Math.floor(Date.now() / 1000);
    if (now - payload.issuedAt > ttlSeconds) return null;

    return payload;
  } catch {
    return null;
  }
}

export function getDashboardGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const allowedEmails = getDashboardAllowedEmails();
  const hostedDomain = process.env.GOOGLE_HOSTED_DOMAIN?.trim().toLowerCase();

  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET environment variable");
  }

  if (allowedEmails.length === 0 && !hostedDomain) {
    throw new Error(
      "Missing DASHBOARD_ALLOWED_EMAILS or GOOGLE_HOSTED_DOMAIN environment variable"
    );
  }

  return {
    baseUrl: getAppBaseUrl(),
    clientId,
    clientSecret,
    allowedEmails,
    hostedDomain,
  };
}

export function isDashboardEmailAllowed(email: string): boolean {
  const normalizedEmail = email.trim().toLowerCase();
  const allowedEmails = getDashboardAllowedEmails();
  const hostedDomain = process.env.GOOGLE_HOSTED_DOMAIN?.trim().toLowerCase();

  if (allowedEmails.includes(normalizedEmail)) return true;

  if (hostedDomain) {
    return normalizedEmail.endsWith(`@${hostedDomain}`);
  }

  return false;
}

export function sanitizeDashboardReturnTo(value?: string | null): string {
  if (!value || !value.startsWith("/")) return "/dashboard";
  if (value.startsWith("//")) return "/dashboard";
  return value;
}

export async function createDashboardSessionToken(input: {
  email: string;
  name?: string;
}): Promise<string> {
  return createSignedToken(DASHBOARD_SESSION_VERSION, {
    email: input.email.trim().toLowerCase(),
    issuedAt: Math.floor(Date.now() / 1000),
    name: input.name?.trim() || undefined,
  });
}

export async function getDashboardSession(
  cookieValue: string | undefined
): Promise<DashboardSessionPayload | null> {
  return parseSignedToken<DashboardSessionPayload>(
    cookieValue,
    DASHBOARD_SESSION_VERSION,
    DASHBOARD_SESSION_TTL_SECONDS
  );
}

export async function isDashboardAuthenticated(
  cookieValue: string | undefined
): Promise<boolean> {
  return (await getDashboardSession(cookieValue)) !== null;
}

export async function isDashboardRequestAuthenticated(
  request: NextRequest
): Promise<boolean> {
  return isDashboardAuthenticated(
    request.cookies.get(DASHBOARD_COOKIE_NAME)?.value
  );
}

export async function createDashboardOauthState(
  returnTo?: string | null
): Promise<{ cookieValue: string; state: string }> {
  const state = crypto.randomUUID();
  const safeReturnTo = sanitizeDashboardReturnTo(returnTo);
  const cookieValue = await createSignedToken(DASHBOARD_OAUTH_STATE_VERSION, {
    issuedAt: Math.floor(Date.now() / 1000),
    returnTo: safeReturnTo,
    state,
  });

  return { cookieValue, state };
}

export async function readDashboardOauthState(
  cookieValue: string | undefined
): Promise<DashboardOauthStatePayload | null> {
  return parseSignedToken<DashboardOauthStatePayload>(
    cookieValue,
    DASHBOARD_OAUTH_STATE_VERSION,
    DASHBOARD_OAUTH_STATE_TTL_SECONDS
  );
}
