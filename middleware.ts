import { NextRequest, NextResponse } from "next/server";
import {
  DASHBOARD_COOKIE_NAME,
  isDashboardAuthenticated,
} from "@/lib/dashboard-auth";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/dashboard") && pathname !== "/dashboard/login") {
    const cookie = request.cookies.get(DASHBOARD_COOKIE_NAME);

    if (!isDashboardAuthenticated(cookie?.value)) {
      const loginUrl = new URL("/dashboard/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
