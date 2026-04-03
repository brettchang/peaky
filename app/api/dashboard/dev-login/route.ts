import { NextRequest, NextResponse } from "next/server";
import {
  DASHBOARD_COOKIE_NAME,
  DASHBOARD_SESSION_TTL_SECONDS,
  createDashboardSessionToken,
  getDashboardDevPassword,
  sanitizeDashboardReturnTo,
} from "@/lib/dashboard-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const devPassword = getDashboardDevPassword();
  const loginUrl = new URL("/dashboard/login", request.url);

  if (!devPassword) {
    loginUrl.searchParams.set("error", "dev_login_disabled");
    return NextResponse.redirect(loginUrl);
  }

  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  const returnTo = sanitizeDashboardReturnTo(
    String(formData.get("returnTo") ?? "/dashboard")
  );

  if (password !== devPassword) {
    loginUrl.searchParams.set("error", "invalid_password");
    loginUrl.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(loginUrl);
  }

  const sessionToken = await createDashboardSessionToken({
    email: "local-dev@thepeakmediaco.com",
    name: "Local Dev",
  });

  const response = NextResponse.redirect(new URL(returnTo, request.url));
  response.cookies.set(DASHBOARD_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: DASHBOARD_SESSION_TTL_SECONDS,
  });

  return response;
}
