import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      error: "Legacy Nylas auth has been removed. Use the Missive integration instead.",
    },
    { status: 410 }
  );
}
