import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "Legacy Nylas webhook has been removed. Use /api/email/missive/webhook instead.",
    },
    { status: 410 }
  );
}
