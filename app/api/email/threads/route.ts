import { NextResponse } from "next/server";
import { ensurePrimaryMailbox, syncMailboxThreads } from "@/lib/email/service";
import { listThreads } from "@/lib/email/db";

export async function GET() {
  try {
    const mailbox = await ensurePrimaryMailbox();
    const threads = await listThreads(mailbox.id);
    return NextResponse.json({ mailbox, threads });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load email threads" },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const threads = await syncMailboxThreads();
    return NextResponse.json({ threads });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sync mailbox threads" },
      { status: 500 }
    );
  }
}
