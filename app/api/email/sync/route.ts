import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { syncMailboxThreads } from "@/lib/email/service";

export async function POST() {
  try {
    const threads = await syncMailboxThreads();
    revalidatePath("/dashboard");
    return NextResponse.json({ threads });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sync mailbox" },
      { status: 500 }
    );
  }
}
