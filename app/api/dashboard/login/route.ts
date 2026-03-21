import { NextRequest, NextResponse } from "next/server";
import {
  DASHBOARD_OAUTH_STATE_COOKIE_NAME,
  DASHBOARD_OAUTH_STATE_TTL_SECONDS,
  createDashboardOauthState,
  getDashboardGoogleConfig,
} from "@/lib/dashboard-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { clientId, hostedDomain } = getDashboardGoogleConfig();
    const appOrigin = request.nextUrl.origin;
    const returnTo = request.nextUrl.searchParams.get("returnTo");
    const { cookieValue, state } = await createDashboardOauthState(returnTo);
    const redirectUri = `${appOrigin}/api/dashboard/callback`;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      prompt: "select_account",
      state,
    });

    if (hostedDomain) {
      params.set("hd", hostedDomain);
    }

    const response = NextResponse.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    );

    response.cookies.set(DASHBOARD_OAUTH_STATE_COOKIE_NAME, cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: DASHBOARD_OAUTH_STATE_TTL_SECONDS,
    });

    return response;
  } catch (error) {
    console.error("Dashboard login configuration error:", error);
    const loginUrl = new URL("/dashboard/login", request.url);
    loginUrl.searchParams.set("error", "config_missing");
    return NextResponse.redirect(loginUrl);
  }
}
