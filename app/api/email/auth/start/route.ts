import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      error: "Legacy Nylas auth has been removed. Use the Missive integration instead.",
    },
    { status: 410 }
  );
}
