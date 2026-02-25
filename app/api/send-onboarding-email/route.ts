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
      { error: "campaignId, campaignName, clientName, recipientEmail, and portalCampaignUrl are required" },
      { status: 400 }
    );
  }

  const greeting = recipientName?.trim() ? `Hi ${recipientName.trim()},` : "Hi there,";
  const firstName =
    recipientName?.trim().split(/\s+/).filter(Boolean)[0] ?? "there";
  const subject = `Welcome to The Peak — you're all set, ${firstName}`;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height:1.5; color:#111827;">
      <p>${escapeHtml(greeting)}</p>
      <p>Welcome to The Peak! We&apos;re really glad to have <strong>${escapeHtml(clientName)}</strong> on board and are looking forward to building something great together.</p>
      <p>Your onboarding portal is ready to go. To kick things off, we&apos;ll need you to complete two quick forms inside:</p>
      <ul>
        <li>The billing form</li>
        <li>The copy onboarding form (you can also select your preferred campaign dates here if you have them in mind)</li>
      </ul>
      <p>
        <a href="${escapeAttr(portalCampaignUrl)}" style="display:inline-block;padding:10px 14px;background:#111827;color:white;text-decoration:none;border-radius:8px;">
          Open Client Portal
        </a>
      </p>
      <p>Once those are in, here&apos;s what the process looks like from there:</p>
      <ol>
        <li>We&apos;ll send over your insertion order and invoice, and our team will get to work on your ad copy.</li>
        <li>When the copy is ready, you&apos;ll get an email from us with a link to review it in your client portal. The portal is your home base throughout the campaign — it&apos;s where we share copy drafts, you can leave feedback or make direct edits, and you&apos;ll find your performance analytics once your placement goes live.</li>
        <li>From there, you can either suggest changes or approve the copy directly. We&apos;ll move quickly once we have your sign-off.</li>
        <li>After your placement runs, analytics will appear in your portal within 24 hours so you can see exactly how it performed.</li>
      </ol>
      <p>If you have any questions at any point, just reply to this email and someone from our team will get back to you.</p>
      <p>Thanks again for supporting The Peak. We&apos;re excited to get this one live.</p>
      <p>The Peak Team</p>
    </div>
  `;

  const text = [
    greeting,
    "",
    `Welcome to The Peak! We're really glad to have ${clientName} on board and are looking forward to building something great together.`,
    "",
    "Your onboarding portal is ready to go. To kick things off, we'll need you to complete two quick forms inside:",
    "",
    "- The billing form",
    "- The copy onboarding form (you can also select your preferred campaign dates here if you have them in mind)",
    "",
    "[Open Client Portal]",
    portalCampaignUrl,
    "",
    "Once those are in, here's what the process looks like from there:",
    "",
    "1. We'll send over your insertion order and invoice, and our team will get to work on your ad copy.",
    "",
    "2. When the copy is ready, you'll get an email from us with a link to review it in your client portal. The portal is your home base throughout the campaign — it's where we share copy drafts, you can leave feedback or make direct edits, and you'll find your performance analytics once your placement goes live.",
    "",
    "3. From there, you can either suggest changes or approve the copy directly. We'll move quickly once we have your sign-off.",
    "",
    "4. After your placement runs, analytics will appear in your portal within 24 hours so you can see exactly how it performed.",
    "",
    "If you have any questions at any point, just reply to this email and someone from our team will get back to you.",
    "",
    "Thanks again for supporting The Peak. We're excited to get this one live.",
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
        { name: "email_type", value: "onboarding" },
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
