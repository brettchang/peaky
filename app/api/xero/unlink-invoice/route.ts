import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/index";
import * as schema from "@/lib/db/schema";
import { revalidatePath } from "next/cache";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { linkId } = body;

    if (!linkId) {
      return NextResponse.json(
        { error: "linkId is required" },
        { status: 400 }
      );
    }

    // Get the link to know which campaign to revalidate
    const link = await db.query.campaignInvoices.findFirst({
      where: eq(schema.campaignInvoices.id, linkId),
    });

    if (!link) {
      return NextResponse.json(
        { error: "Invoice link not found" },
        { status: 404 }
      );
    }

    await db
      .delete(schema.campaignInvoices)
      .where(eq(schema.campaignInvoices.id, linkId));

    revalidatePath(`/dashboard/${link.campaignId}`);
    revalidatePath("/dashboard/invoicing");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unlink invoice error:", error);
    return NextResponse.json(
      { error: "Failed to unlink invoice" },
      { status: 500 }
    );
  }
}
