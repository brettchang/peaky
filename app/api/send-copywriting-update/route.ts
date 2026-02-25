import { NextRequest, NextResponse } from "next/server";
import { DASHBOARD_COOKIE_NAME, isDashboardAuthenticated } from "@/lib/dashboard-auth";

interface SendEmailPayload {
  campaignId: string;
  campaignName: string;
  clientName: string;
  recipientEmail: string;
  recipientName?: string;
  portalCampaignUrl: string;
}

export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(DASHBOARD_COOKIE_NAME);
  if (!isDashboardAuthenticated(cookie?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "RESEND_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) {
    return NextResponse.json(
      { error: "RESEND_FROM_EMAIL is not configured" },
      { status: 500 }
    );
  }

  const body = (await request.json()) as SendEmailPayload;
  const {
    campaignId,
    campaignName,
    clientName,
    recipientEmail,
    recipientName,
    portalCampaignUrl,
  } = body;

  if (
    !campaignId ||
    !campaignName ||
    !clientName ||
    !recipientEmail ||
    !portalCampaignUrl
  ) {
    return NextResponse.json(
      {
        error:
          "campaignId, campaignName, clientName, recipientEmail, and portalCampaignUrl are required",
      },
      { status: 400 }
    );
  }

  const greeting = recipientName?.trim() ? `Hi ${recipientName.trim()},` : "Hi there,";
  const subject = `Your copy is ready for review — ${clientName}`;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height:1.5; color:#111827;">
      <p>${escapeHtml(greeting)}</p>
      <p>Good news — your copywriting is ready for review for <strong>${escapeHtml(campaignName)}</strong>.</p>
      <p>
        <a href="${escapeAttr(portalCampaignUrl)}" style="display:inline-block;padding:10px 14px;background:#111827;color:white;text-decoration:none;border-radius:8px;">
          Open Client Portal
        </a>
      </p>
      <p>Inside the portal, you can click into each placement and choose one of the following:</p>
      <ul>
        <li>Approve the copy right away</li>
        <li>Make edits directly yourself and approve on the spot</li>
        <li>Submit suggested edits for our team to incorporate</li>
      </ul>
      <p>We&apos;ll move quickly once we have your approval or feedback.</p>
      <p>The Peak Team</p>
    </div>
  `;

  const text = [
    greeting,
    "",
    `Good news — your copywriting is ready for review for ${campaignName}.`,
    "",
    "Open Client Portal:",
    portalCampaignUrl,
    "",
    "Inside the portal, click into each placement and choose one of the following:",
    "- Approve the copy right away",
    "- Make edits directly yourself and approve on the spot",
    "- Submit suggested edits for our team to incorporate",
    "",
    "We'll move quickly once we have your approval or feedback.",
    "",
    "The Peak Team",
  ].join("\n");

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [recipientEmail],
      cc: ["adops@thepeakmediaco.com"],
      subject,
      html,
      text,
      tags: [
        { name: "campaign_id", value: toSafeTagValue(campaignId) },
        { name: "client_name", value: toSafeTagValue(clientName) },
        { name: "email_type", value: "copywriting_update" },
      ],
    }),
  });

  const resendData = await resendRes.json();
  if (!resendRes.ok) {
    const errorMessage =
      resendData?.message || resendData?.error || "Failed to send email via Resend";
    return NextResponse.json({ error: errorMessage }, { status: 502 });
  }

  return NextResponse.json({ success: true, id: resendData?.id });
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(input: string): string {
  return input.replace(/"/g, "&quot;");
}

function toSafeTagValue(input: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "unknown";
}
