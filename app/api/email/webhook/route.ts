import { NextRequest, NextResponse } from "next/server";
import { processWebhookPayload } from "@/lib/email/service";
import { verifyNylasWebhookSignature } from "@/lib/email/nylas";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature =
    request.headers.get("x-nylas-signature") || request.headers.get("x-nylas-webhook-signature");

  if (!verifyNylasWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid Nylas webhook signature" }, { status: 401 });
  }

  try {
    const payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
    await processWebhookPayload(payload);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to process Nylas webhook",
      },
      { status: 500 }
    );
  }
}
