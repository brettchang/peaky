import { NextRequest, NextResponse } from "next/server";
import {
  DASHBOARD_COOKIE_NAME,
  DASHBOARD_OAUTH_STATE_COOKIE_NAME,
  DASHBOARD_SESSION_TTL_SECONDS,
  createDashboardSessionToken,
  getDashboardGoogleConfig,
  isDashboardEmailAllowed,
  readDashboardOauthState,
} from "@/lib/dashboard-auth";

export const dynamic = "force-dynamic";

type GoogleUserInfo = {
  email?: string;
  email_verified?: boolean;
  hd?: string;
  name?: string;
};

export async function GET(request: NextRequest) {
  let clientId: string;
  let clientSecret: string;
  let hostedDomain: string | undefined;
  const appOrigin = request.nextUrl.origin;

  try {
    ({ clientId, clientSecret, hostedDomain } = getDashboardGoogleConfig());
  } catch (error) {
    console.error("Dashboard callback configuration error:", error);
    return NextResponse.redirect(
      `${request.nextUrl.origin}/dashboard/login?error=config_missing`
    );
  }

  const clearStateCookie = (response: NextResponse) => {
    response.cookies.set(DASHBOARD_OAUTH_STATE_COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  };

  try {
    const code = request.nextUrl.searchParams.get("code");
    const returnedState = request.nextUrl.searchParams.get("state");
    const oauthState = await readDashboardOauthState(
      request.cookies.get(DASHBOARD_OAUTH_STATE_COOKIE_NAME)?.value
    );

    if (!code || !returnedState || !oauthState || oauthState.state !== returnedState) {
      return clearStateCookie(
        NextResponse.redirect(`${appOrigin}/dashboard/login?error=state_mismatch`)
      );
    }

    const redirectUri = `${appOrigin}/api/dashboard/callback`;
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error(
        "Dashboard Google token exchange failed:",
        tokenResponse.status,
        errorBody
      );
      return clearStateCookie(
        NextResponse.redirect(`${appOrigin}/dashboard/login?error=token_failed`)
      );
    }

    const tokenData = (await tokenResponse.json()) as { access_token?: string };
    if (!tokenData.access_token) {
      return clearStateCookie(
        NextResponse.redirect(`${appOrigin}/dashboard/login?error=token_failed`)
      );
    }

    const userInfoResponse = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      }
    );

    if (!userInfoResponse.ok) {
      const errorBody = await userInfoResponse.text();
      console.error(
        "Dashboard Google userinfo lookup failed:",
        userInfoResponse.status,
        errorBody
      );
      return clearStateCookie(
        NextResponse.redirect(`${appOrigin}/dashboard/login?error=userinfo_failed`)
      );
    }

    const userInfo = (await userInfoResponse.json()) as GoogleUserInfo;
    const email = userInfo.email?.trim().toLowerCase();

    if (!email || !userInfo.email_verified) {
      return clearStateCookie(
        NextResponse.redirect(`${appOrigin}/dashboard/login?error=email_unverified`)
      );
    }

    if (hostedDomain && userInfo.hd?.toLowerCase() !== hostedDomain) {
      return clearStateCookie(
        NextResponse.redirect(`${appOrigin}/dashboard/login?error=domain_not_allowed`)
      );
    }

    if (!isDashboardEmailAllowed(email)) {
      return clearStateCookie(
        NextResponse.redirect(`${appOrigin}/dashboard/login?error=account_not_allowed`)
      );
    }

    const sessionToken = await createDashboardSessionToken({
      email,
      name: userInfo.name,
    });

    const response = clearStateCookie(
      NextResponse.redirect(`${appOrigin}${oauthState.returnTo}`)
    );
    response.cookies.set(DASHBOARD_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: DASHBOARD_SESSION_TTL_SECONDS,
    });

    return response;
  } catch (error) {
    console.error("Dashboard callback error:", error);
    return clearStateCookie(
      NextResponse.redirect(`${appOrigin}/dashboard/login?error=callback_failed`)
    );
  }
}
