import { NextResponse } from "next/server";
import { getXeroConfig } from "@/lib/env";
import { getAppBaseUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { baseUrl, clientId } = getXeroConfig();
    const redirectUri = `${baseUrl}/api/xero/callback`;
    const scopes =
      "openid profile email accounting.transactions accounting.transactions.read offline_access";

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes,
      prompt: "consent",
    });

    const consentUrl = `https://login.xero.com/identity/connect/authorize?${params}`;
    return NextResponse.redirect(consentUrl);
  } catch (error) {
    console.error("Xero connect configuration error:", error);
    return NextResponse.redirect(
      new URL(
        "/dashboard/invoicing?xero_error=config_missing",
        getAppBaseUrl()
      )
    );
  }
}
