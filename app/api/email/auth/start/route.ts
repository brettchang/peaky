import { NextResponse } from "next/server";
import { getEmailAuthStartUrl } from "@/lib/email/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const returnTo = new URL("/dashboard/prompts", request.url).toString();
  return NextResponse.redirect(getEmailAuthStartUrl(returnTo));
}
