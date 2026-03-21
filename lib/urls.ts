function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

export function getAppBaseUrl(): string {
  return trimTrailingSlash(
    process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
  );
}

export function getPortalBaseUrl(): string {
  return trimTrailingSlash(
    process.env.NEXT_PUBLIC_PORTAL_BASE_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      "http://localhost:3000"
  );
}
