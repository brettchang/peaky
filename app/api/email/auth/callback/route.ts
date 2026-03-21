import { NextRequest, NextResponse } from "next/server";
import { completeHostedAuth, decodeEmailAuthState } from "@/lib/email/service";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code") || undefined;
    const grantId = searchParams.get("grant_id") || searchParams.get("grantId") || undefined;
    const accountId =
      searchParams.get("account_id") || searchParams.get("accountId") || undefined;
    const email = searchParams.get("email") || undefined;
    const state = searchParams.get("state");
    const authState = decodeEmailAuthState(state);

    await completeHostedAuth({
      code,
      grantId,
      accountId,
      email,
      payload: Object.fromEntries(searchParams.entries()),
    });

    const fallbackUrl = new URL("/dashboard/prompts", request.url);
    const redirectUrl = authState.returnTo ? new URL(authState.returnTo) : fallbackUrl;
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to complete Nylas auth",
      },
      { status: 500 }
    );
  }
}
