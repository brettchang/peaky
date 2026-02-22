import { NextRequest, NextResponse } from "next/server";
import { createXeroClient, saveXeroConnection } from "@/lib/xero";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL!;

  try {
    const client = createXeroClient();
    await client.initialize();

    const callbackUrl = request.url;
    const tokenSet = await client.apiCallback(callbackUrl);

    await client.updateTenants();
    const tenants = client.tenants;

    if (!tenants || tenants.length === 0) {
      return NextResponse.redirect(
        `${baseUrl}/dashboard/invoicing?xero_error=no_org`
      );
    }

    // Use the first tenant (org)
    const tenant = tenants[0];

    await saveXeroConnection({
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
      accessToken: tokenSet.access_token!,
      refreshToken: tokenSet.refresh_token!,
      expiresIn: tokenSet.expires_in ?? 1800,
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
