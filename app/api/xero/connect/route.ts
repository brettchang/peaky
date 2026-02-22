import { NextResponse } from "next/server";
import { createXeroClient } from "@/lib/xero";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const client = createXeroClient();
    await client.initialize();
    const consentUrl = await client.buildConsentUrl();
    return NextResponse.redirect(consentUrl);
  } catch (error) {
    console.error("Xero connect error:", error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/invoicing?xero_error=connect_failed`
    );
  }
}
