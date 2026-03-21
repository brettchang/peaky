import { NextRequest, NextResponse } from "next/server";
import { syncMailboxThreads } from "@/lib/email/service";

export async function POST(request: NextRequest) {
  return runCron(request);
}

export async function GET(request: NextRequest) {
  return runCron(request);
}

async function runCron(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization") ?? "";
  const expectedAuth = cronSecret ? `Bearer ${cronSecret}` : "";

  if (!cronSecret || authHeader !== expectedAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const threads = await syncMailboxThreads({ threadLimit: 100 });
    return NextResponse.json({
      ok: true,
      syncedThreads: threads.length,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to sync mailbox threads",
      },
      { status: 500 }
    );
  }
}
