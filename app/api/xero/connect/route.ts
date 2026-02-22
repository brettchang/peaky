import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL!;
  const clientId = process.env.XERO_CLIENT_ID!;
  const redirectUri = `${baseUrl}/api/xero/callback`;
  const scopes = "openid profile email accounting.transactions.read offline_access";

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes,
  });

  const consentUrl = `https://login.xero.com/identity/connect/authorize?${params}`;
  return NextResponse.redirect(consentUrl);
}
