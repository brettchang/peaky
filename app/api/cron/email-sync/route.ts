import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "Legacy Nylas email sync has been removed. Email automation now runs through Missive.",
    },
    { status: 410 }
  );
}

export async function GET() {
  return NextResponse.json(
    {
      error: "Legacy Nylas email sync has been removed. Email automation now runs through Missive.",
    },
    { status: 410 }
  );
}
