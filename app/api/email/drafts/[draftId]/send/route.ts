import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { sendDraft } from "@/lib/email/service";

export async function POST(
  _request: Request,
  { params }: { params: { draftId: string } }
) {
  try {
    await sendDraft(params.draftId);
    revalidatePath("/dashboard");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send draft" },
      { status: 500 }
    );
  }
}
