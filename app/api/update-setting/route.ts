import { NextRequest, NextResponse } from "next/server";
import { upsertSetting } from "@/lib/db";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { key, value } = body;

  if (!key || typeof value !== "string") {
    return NextResponse.json(
      { error: "key and value are required" },
      { status: 400 }
    );
  }

  await upsertSetting(key, value);
  return NextResponse.json({ success: true });
}
