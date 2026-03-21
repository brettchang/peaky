import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { createManualDraft } from "@/lib/email/service";

export async function POST(
  request: NextRequest,
  { params }: { params: { threadId: string } }
) {
  try {
    const body = (await request.json()) as {
      subject?: string;
      bodyText?: string;
    };

    const thread = await createManualDraft({
      threadId: params.threadId,
      subject: body.subject || "",
      bodyText: body.bodyText || "",
    });

    revalidatePath("/dashboard");
    return NextResponse.json({ thread });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create manual draft" },
      { status: 500 }
    );
  }
}
