import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { updateCampaignInvoiceNotes } from "@/lib/db";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    invoiceLinkId?: string;
    notes?: string | null;
  };

  const invoiceLinkId = body.invoiceLinkId?.trim();
  const nextNotes =
    typeof body.notes === "string" ? body.notes.trim() : body.notes;

  if (!invoiceLinkId) {
    return NextResponse.json(
      { error: "invoiceLinkId is required" },
      { status: 400 }
    );
  }

  const updated = await updateCampaignInvoiceNotes(
    invoiceLinkId,
    nextNotes && nextNotes.length > 0 ? nextNotes : null
  );

  if (!updated) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  revalidatePath("/dashboard/invoicing");
  revalidatePath(`/dashboard/invoicing/${invoiceLinkId}`);

  return NextResponse.json({ success: true });
}
