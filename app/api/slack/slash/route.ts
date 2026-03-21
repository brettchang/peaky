import { createHmac, timingSafeEqual } from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { NextRequest, NextResponse } from "next/server";
import { processSlackEmailAgentCommand } from "@/lib/email/missive-service";

function verifySlackSignature(rawBody: string, timestamp: string, signature: string): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET?.trim();
  if (!secret) return false;

  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
  if (Number(timestamp) < fiveMinutesAgo) return false;

  const sigBase = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${createHmac("sha256", secret).update(sigBase).digest("hex")}`;
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(signature, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

async function handleAsync(instruction: string, responseUrl: string): Promise<void> {
  try {
    const result = await processSlackEmailAgentCommand(instruction);
    const appUrl = result.missiveConversationUrl
      ? result.missiveConversationUrl.replace("https://mail.missiveapp.com/", "missive://")
      : undefined;
    const text = result.missiveConversationUrl
      ? `Draft created for *${result.clientName ?? "client"}*.\n*Subject:* ${result.subject}\n<${appUrl}|Open in Missive App> · <${result.missiveConversationUrl}|Open in Browser>`
      : `Draft created for *${result.clientName ?? "client"}*.\n*Subject:* ${result.subject}\nOpen Missive to review.`;

    await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response_type: "ephemeral", text }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        response_type: "ephemeral",
        text: `Failed to create draft: ${message}`,
      }),
    });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();
  const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
  const signature = request.headers.get("x-slack-signature") ?? "";

  if (!verifySlackSignature(rawBody, timestamp, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const command = params.get("command") ?? "";
  const text = params.get("text")?.trim() ?? "";
  const responseUrl = params.get("response_url") ?? "";

  if (command !== "/email-agent") {
    return NextResponse.json({ error: "Unknown command" }, { status: 400 });
  }

  if (!text) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: "Usage: `/email-agent <describe what you want drafted>`\nExample: `/email-agent Draft an email for Test Campaign telling them their metrics are ready in their portal`",
    });
  }

  // Respond immediately to Slack (must be within 3s).
  // waitUntil keeps the serverless function alive to complete the async work.
  waitUntil(handleAsync(text, responseUrl));

  return NextResponse.json({
    response_type: "ephemeral",
    text: `On it. Drafting an email based on your instruction...`,
  });
}
