import { NextResponse } from "next/server";
import { deleteXeroConnection } from "@/lib/xero";

export async function POST() {
  try {
    await deleteXeroConnection();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Xero disconnect error:", error);
    return NextResponse.json(
      { error: "Failed to disconnect" },
      { status: 500 }
    );
  }
}
