import { NextRequest, NextResponse } from "next/server";
import {
  DASHBOARD_COOKIE_NAME,
  sanitizeDashboardReturnTo,
} from "@/lib/dashboard-auth";

export const dynamic = "force-dynamic";

function buildLogoutResponse(request: NextRequest) {
  const returnTo = sanitizeDashboardReturnTo(
    request.nextUrl.searchParams.get("returnTo") ?? "/dashboard/login"
  );
  const response = NextResponse.redirect(new URL(returnTo, request.url));
  response.cookies.set(DASHBOARD_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  return buildLogoutResponse(request);
}

export async function POST(request: NextRequest) {
  return buildLogoutResponse(request);
}
