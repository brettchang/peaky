import { NextRequest, NextResponse } from "next/server";
import { saveXeroConnection } from "@/lib/xero";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL!;
  const clientId = process.env.XERO_CLIENT_ID!;
  const clientSecret = process.env.XERO_CLIENT_SECRET!;
  const redirectUri = `${baseUrl}/api/xero/callback`;

  try {
    const code = request.nextUrl.searchParams.get("code");
    if (!code) {
      const error = request.nextUrl.searchParams.get("error");
      console.error("Xero callback missing code, error:", error);
      return NextResponse.redirect(
        `${baseUrl}/dashboard/invoicing?xero_error=no_code`
      );
    }

    // Exchange authorization code for tokens
    const tokenResponse = await fetch(
      "https://identity.xero.com/connect/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error("Xero token exchange failed:", tokenResponse.status, errorBody);
      return NextResponse.redirect(
        `${baseUrl}/dashboard/invoicing?xero_error=token_failed`
      );
    }

    const tokenData = await tokenResponse.json();

    // Fetch connected tenants (orgs)
    const tenantsResponse = await fetch(
      "https://api.xero.com/connections",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!tenantsResponse.ok) {
      console.error("Xero tenants fetch failed:", tenantsResponse.status);
      return NextResponse.redirect(
        `${baseUrl}/dashboard/invoicing?xero_error=tenants_failed`
      );
    }

    const tenants = await tenantsResponse.json();

    if (!tenants || tenants.length === 0) {
      return NextResponse.redirect(
        `${baseUrl}/dashboard/invoicing?xero_error=no_org`
      );
    }

    const tenant = tenants[0];

    await saveXeroConnection({
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresIn: tokenData.expires_in ?? 1800,
    });

    return NextResponse.redirect(
      `${baseUrl}/dashboard/invoicing?xero_connected=true`
    );
  } catch (error) {
    console.error("Xero callback error:", error);
    return NextResponse.redirect(
      `${baseUrl}/dashboard/invoicing?xero_error=callback_failed`
    );
  }
}
