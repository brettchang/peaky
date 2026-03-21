import { NextRequest, NextResponse } from "next/server";
import { processMissiveWebhookPayload } from "@/lib/email/missive-service";
import { verifyMissiveWebhookSignature, type MissiveWebhookPayload } from "@/lib/email/missive";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature =
    request.headers.get("x-hook-signature") ||
    request.headers.get("X-Hook-Signature") ||
    request.headers.get("x-missive-signature");

  if (!verifyMissiveWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid Missive webhook signature" }, { status: 401 });
  }

  try {
    const payload = rawBody ? (JSON.parse(rawBody) as MissiveWebhookPayload) : {};
    const result = await processMissiveWebhookPayload(payload);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[missive-webhook] Error processing webhook:", error instanceof Error ? error.message : String(error));
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to process Missive webhook",
      },
      { status: 500 }
    );
  }
}
