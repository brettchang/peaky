import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import { cookies } from "next/headers";
import { BrandMark } from "@/components/BrandMark";
import {
  DASHBOARD_COOKIE_NAME,
  isDashboardAuthenticated,
} from "@/lib/dashboard-auth";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Peak Client Portal",
  description: "Review and approve your ad campaigns",
  icons: {
    icon: "/brand/peak-binoculars.svg",
    shortcut: "/brand/peak-binoculars.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = cookies();
  const isSignedIn = await isDashboardAuthenticated(
    cookieStore.get(DASHBOARD_COOKIE_NAME)?.value
  );

  return (
    <html lang="en">
      <body className={`${geistSans.variable} font-[family-name:var(--font-geist-sans)] antialiased`}>
        <div className="min-h-screen">
          <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur">
            <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
              <BrandMark />
              <nav className="flex items-center gap-2 text-sm">
                <Link
                  href="/dashboard"
                  className="rounded-md px-2 py-1 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                >
                  Dashboard
                </Link>
                <Link
                  href="/dashboard/tasks"
                  className="rounded-md px-2 py-1 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                >
                  Tasks
                </Link>
                <Link
                  href="/dashboard/invoicing"
                  className="rounded-md px-2 py-1 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                >
                  Invoicing
                </Link>
                <Link
                  href="/dashboard/prompts"
                  className="rounded-md px-2 py-1 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                >
                  Prompts
                </Link>
                {isSignedIn && (
                  <form action="/api/dashboard/logout?returnTo=/dashboard/login" method="post">
                    <button
                      type="submit"
                      className="rounded-md px-2 py-1 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    >
                      Sign Out
                    </button>
                  </form>
                )}
              </nav>
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
