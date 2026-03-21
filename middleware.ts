import { NextRequest, NextResponse } from "next/server";
import {
  DASHBOARD_COOKIE_NAME,
  isDashboardAuthenticated,
} from "@/lib/dashboard-auth";

const PROTECTED_API_PREFIXES = [
  "/api/add-placement",
  "/api/bulk-schedule",
  "/api/campaign-manager-notes",
  "/api/create-campaign",
  "/api/create-io",
  "/api/create-onboarding-round",
  "/api/dashboard/tasks/dismiss",
  "/api/delete-campaign",
  "/api/delete-placement",
  "/api/email/auth/start",
  "/api/email/drafts",
  "/api/email/sync",
  "/api/email/threads",
  "/api/generate-copy",
  "/api/invoicing",
  "/api/override-onboarding",
  "/api/publish-beehiiv",
  "/api/schedule-capacity",
  "/api/sync-beehiiv-stats",
  "/api/update-ad-line-items",
  "/api/update-billing-onboarding",
  "/api/update-campaign",
  "/api/update-placement",
  "/api/update-placement-round",
  "/api/update-schedule",
  "/api/update-setting",
  "/api/upload-onboarding-doc",
  "/api/xero",
];

function isProtectedAdminApi(pathname: string): boolean {
  return PROTECTED_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function buildLoginUrl(request: NextRequest): URL {
  const loginUrl = new URL("/dashboard/login", request.url);
  const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  loginUrl.searchParams.set("returnTo", returnTo);
  return loginUrl;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const cookie = request.cookies.get(DASHBOARD_COOKIE_NAME);
  const hasDashboardCookie = Boolean(cookie?.value);
  const isAuthenticated = await isDashboardAuthenticated(cookie?.value);

  if (pathname.startsWith("/dashboard") && pathname !== "/dashboard/login") {
    if (!hasDashboardCookie) {
      return NextResponse.redirect(buildLoginUrl(request));
    }
    return NextResponse.next();
  }

  if (isProtectedAdminApi(pathname) && !isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
