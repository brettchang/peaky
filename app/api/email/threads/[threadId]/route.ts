import { NextRequest, NextResponse } from "next/server";
import { getThreadById, setThreadNoReplyNeeded } from "@/lib/email/db";
import { syncAndMaybeDraftThread } from "@/lib/email/service";

export async function GET(
  _request: NextRequest,
  { params }: { params: { threadId: string } }
) {
  const thread = await getThreadById(params.threadId);
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
  return NextResponse.json({ thread });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { threadId: string } }
) {
  try {
    const body = (await request.json()) as { noReplyNeeded?: boolean; refresh?: boolean };
    if (body.refresh) {
      const thread = await syncAndMaybeDraftThread(params.threadId);
      return NextResponse.json({ thread });
    }
    if (typeof body.noReplyNeeded === "boolean") {
      await setThreadNoReplyNeeded(params.threadId, body.noReplyNeeded);
    }
    const thread = await getThreadById(params.threadId);
    return NextResponse.json({ thread });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update thread" },
      { status: 500 }
    );
  }
}
