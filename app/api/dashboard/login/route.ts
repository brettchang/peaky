import { NextRequest, NextResponse } from "next/server";
import {
  DASHBOARD_COOKIE_NAME,
  DASHBOARD_COOKIE_VALUE,
} from "@/lib/dashboard-auth";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { password } = body;

  if (!password) {
    return NextResponse.json(
      { error: "Password is required" },
      { status: 400 }
    );
  }

  if (password !== process.env.DASHBOARD_PASSWORD) {
    return NextResponse.json(
      { error: "Invalid password" },
      { status: 401 }
    );
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(DASHBOARD_COOKIE_NAME, DASHBOARD_COOKIE_VALUE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return response;
}
