import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { approveDraft, rejectDraft, saveDraftEdits } from "@/lib/email/service";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { draftId: string } }
) {
  try {
    const body = (await request.json()) as {
      status?: "approved" | "rejected";
      subject?: string;
      bodyHtml?: string;
      bodyText?: string;
    };

    if (body.status === "approved") {
      await approveDraft(params.draftId);
    } else if (body.status === "rejected") {
      await rejectDraft(params.draftId);
    } else if (body.subject || body.bodyHtml || body.bodyText) {
      await saveDraftEdits({
        draftId: params.draftId,
        subject: body.subject || "",
        bodyHtml: body.bodyHtml || "",
        bodyText: body.bodyText,
      });
    } else {
      return NextResponse.json({ error: "No draft update fields provided" }, { status: 400 });
    }

    revalidatePath("/dashboard");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update draft" },
      { status: 500 }
    );
  }
}
