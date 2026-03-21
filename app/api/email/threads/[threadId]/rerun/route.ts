import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { rerunDraftAgent } from "@/lib/email/service";

export async function POST(
  _request: Request,
  { params }: { params: { threadId: string } }
) {
  try {
    const thread = await rerunDraftAgent(params.threadId);
    revalidatePath("/dashboard");
    return NextResponse.json({ thread });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to rerun draft agent" },
      { status: 500 }
    );
  }
}
