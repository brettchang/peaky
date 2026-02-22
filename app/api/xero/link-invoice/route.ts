import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/index";
import * as schema from "@/lib/db/schema";
import { customAlphabet } from "nanoid";
import { revalidatePath } from "next/cache";

const nanoid = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 16);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { campaignId, xeroInvoiceId, notes } = body;

    if (!campaignId || !xeroInvoiceId) {
      return NextResponse.json(
        { error: "campaignId and xeroInvoiceId are required" },
        { status: 400 }
      );
    }

    // Verify campaign exists
    const campaign = await db.query.campaigns.findFirst({
      where: eq(schema.campaigns.id, campaignId),
    });
    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    await db.insert(schema.campaignInvoices).values({
      id: nanoid(),
      campaignId,
      xeroInvoiceId,
      linkedAt: new Date(),
      notes: notes ?? null,
    });

    revalidatePath(`/dashboard/${campaignId}`);
    revalidatePath("/dashboard/invoicing");

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    // Handle unique constraint violation
    if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "23505") {
      return NextResponse.json(
        { error: "This invoice is already linked to this campaign" },
        { status: 409 }
      );
    }
    console.error("Link invoice error:", error);
    return NextResponse.json(
      { error: "Failed to link invoice" },
      { status: 500 }
    );
  }
}
