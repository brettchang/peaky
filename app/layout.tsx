import type { Metadata } from "next";
import localFont from "next/font/local";
import { BrandMark } from "@/components/BrandMark";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Peak Client Portal",
  description: "Review and approve your ad campaigns",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} font-[family-name:var(--font-geist-sans)] antialiased`}>
        <div className="min-h-screen">
          <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur">
            <div className="mx-auto flex h-14 max-w-7xl items-center px-4">
              <BrandMark />
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
