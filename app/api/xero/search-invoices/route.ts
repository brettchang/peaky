import { NextRequest, NextResponse } from "next/server";
import { getXeroConnection, fetchXeroInvoices } from "@/lib/xero";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const conn = await getXeroConnection();
    if (!conn) {
      return NextResponse.json(
        { error: "Xero not connected" },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const searchTerm = searchParams.get("q") ?? undefined;
    const statuses = searchParams.get("statuses")?.split(",") ?? undefined;

    const invoices = await fetchXeroInvoices(
      conn.tenantId,
      conn.accessToken,
      { searchTerm, statuses }
    );

    return NextResponse.json({ invoices });
  } catch (error) {
    console.error("Search invoices error:", error);
    return NextResponse.json(
      { error: "Failed to search invoices" },
      { status: 500 }
    );
  }
}
