/**
 * Generate a Word-compatible HTML document from a campaign in the database.
 *
 * Usage:
 *   npx tsx scripts/generate-doc.ts --campaign "Campaign Name" --type onboarding
 *   npx tsx scripts/generate-doc.ts --campaign "Campaign Name" --type copy-review
 *   npx tsx scripts/generate-doc.ts --id <campaign-id> --type copy-review
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { eq, ilike } from "drizzle-orm";
import { drizzle } from "drizzle-orm/vercel-postgres";
import { sql as pgSql } from "@vercel/postgres";
import * as schema from "../lib/db/schema";
import * as fs from "fs";
import * as path from "path";
import { isPodcastPlacement } from "../lib/types";
import type { Campaign, Placement } from "../lib/types";

const db = drizzle(pgSql, { schema });

// ─── CLI args ───────────────────────────────────────────────────────────────

type DocType = "onboarding" | "copy-review" | "billing";

function parseArgs(): { identifier: string; byId: boolean; docType: DocType } {
  const args = process.argv.slice(2);
  let identifier = "";
  let byId = false;
  let docType: DocType = "copy-review";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--campaign" && args[i + 1]) {
      identifier = args[++i];
    } else if (args[i] === "--id" && args[i + 1]) {
      identifier = args[++i];
      byId = true;
    } else if (args[i] === "--type" && args[i + 1]) {
      const t = args[++i];
      if (t !== "onboarding" && t !== "copy-review" && t !== "billing") {
        console.error(`Invalid --type "${t}". Must be "onboarding", "copy-review", or "billing".`);
        process.exit(1);
      }
      docType = t;
    }
  }

  if (!identifier) {
    console.error("Usage: npx tsx scripts/generate-doc.ts --campaign <name> --type <onboarding|copy-review|billing>");
    console.error("   or: npx tsx scripts/generate-doc.ts --id <campaign-id> --type <onboarding|copy-review|billing>");
    process.exit(1);
  }

  return { identifier, byId, docType };
}

// ─── DB lookup ──────────────────────────────────────────────────────────────

async function findCampaign(identifier: string, byId: boolean) {
  if (byId) {
    const row = await db.query.campaigns.findFirst({
      where: eq(schema.campaigns.id, identifier),
      with: {
        client: true,
        placements: { with: { revisionHistory: true } },
        onboardingRounds: true,
        billingOnboarding: true,
      },
    });
    return row ?? null;
  }

  // Search by name (case-insensitive, partial match)
  const rows = await db.query.campaigns.findMany({
    where: ilike(schema.campaigns.name, `%${identifier}%`),
    with: {
      client: true,
      placements: { with: { revisionHistory: true } },
      onboardingRounds: true,
      billingOnboarding: true,
    },
  });

  if (rows.length === 0) return null;

  if (rows.length > 1) {
    console.log(`\nFound ${rows.length} campaigns matching "${identifier}":`);
    rows.forEach((r, i) => console.log(`  ${i + 1}. ${r.name} (ID: ${r.id})`));
    console.log('\nRe-run with --id <campaign-id> to select a specific one.');
    process.exit(1);
  }

  return rows[0];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "TBD";
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function esc(str: string | null | undefined): string {
  return (str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function detectFormType(placements: Placement[]): "newsletter" | "podcast" {
  return placements.some((p) => isPodcastPlacement(p.type, p.publication))
    ? "podcast"
    : "newsletter";
}

/** Convert markdown copy to HTML — mirrors the portal's format-copy.tsx rendering. */
function formatCopyToHtml(text: string): string {
  const lines = text.split("\n");
  const parts: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim() === "") {
      parts.push("<br>");
      continue;
    }

    // Bullet points — group consecutive items
    if (line.trimStart().startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith("- ")) {
        items.push(`<li>${inlineFormatHtml(lines[i].trimStart().slice(2))}</li>`);
        i++;
      }
      i--; // back up so the for-loop increment lands correctly
      parts.push(`<ul style="margin:6px 0 6px 24px;list-style:disc;">${items.join("")}</ul>`);
      continue;
    }

    // CTA links like [Text →]
    if (line.trim().startsWith("[") && line.trim().endsWith("]")) {
      const linkText = line.trim().slice(1, -1);
      parts.push(`<p style="margin-top:12px;"><span style="display:inline-block;background:#111;color:#fff;padding:8px 20px;border-radius:6px;font-size:10pt;font-weight:600;">${esc(linkText)}</span></p>`);
      continue;
    }

    // Regular paragraph
    parts.push(`<p style="line-height:1.65;margin:0 0 2px;">${inlineFormatHtml(line)}</p>`);
  }

  return parts.join("");
}

/** Inline markdown: **bold**, [label](url), bare URLs */
function inlineFormatHtml(text: string): string {
  // Escape HTML first, then apply formatting
  let escaped = esc(text);
  // Bold: **text**
  escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Markdown links: [label](url)
  escaped = escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" style="color:#1d4ed8;text-decoration:underline;">$1</a>');
  // Bare URLs (not already inside an href)
  escaped = escaped.replace(/(?<!href="|">)(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#1d4ed8;text-decoration:underline;">$1</a>');
  return escaped;
}

// ─── Shared CSS ─────────────────────────────────────────────────────────────

const SHARED_CSS = `
  body { font-family: 'Calibri', 'Arial', sans-serif; font-size: 11pt; color: #111; margin: 0; padding: 0; background: white; }
  .page { max-width: 720px; margin: 0 auto; padding: 60px; }
  .header { border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 32px; }
  .brand { font-size: 13pt; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }
  .doc-title { font-size: 20pt; font-weight: 700; margin: 10px 0 4px; }
  .doc-subtitle { font-size: 10pt; color: #555; }
  .meta-row { display: flex; gap: 40px; margin-top: 20px; }
  .meta-field { flex: 1; }
  .meta-label { font-size: 8pt; text-transform: uppercase; letter-spacing: .1em; color: #888; font-weight: 700; }
  .meta-value { border-bottom: 1px solid #ccc; min-height: 22px; margin-top: 4px; font-size: 11pt; padding-bottom: 2px; }
  .instructions { background: #f5f5f5; border-left: 3px solid #111; padding: 12px 16px; margin-bottom: 32px; font-size: 10pt; color: #444; line-height: 1.6; }
  .section { margin-bottom: 36px; }
  .section-title { font-size: 12pt; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; border-bottom: 1px solid #ccc; padding-bottom: 6px; margin-bottom: 20px; }
  .field { margin-bottom: 22px; }
  .field-label { font-size: 10pt; font-weight: 700; margin-bottom: 4px; }
  .field-hint { font-size: 9pt; color: #888; font-style: italic; margin-bottom: 6px; }
  .field-input { border: 1px solid #ccc; border-radius: 3px; min-height: 70px; width: 100%; box-sizing: border-box; padding: 8px 10px; font-size: 11pt; font-family: 'Calibri','Arial',sans-serif; background: #fafafa; }
  .field-input.short { min-height: 36px; }
  .field-input.tall { min-height: 100px; }
  .placement-block { border: 1px solid #ccc; border-radius: 4px; padding: 16px 18px; margin-bottom: 18px; background: #fafafa; }
  .notice { background: #f5f5f5; border: 1px solid #ccc; border-radius: 4px; padding: 14px 18px; font-size: 9.5pt; color: #555; margin-top: 20px; }
  .footer { margin-top: 60px; border-top: 1px solid #ccc; padding-top: 24px; display: flex; gap: 60px; }
  .sig-block { flex: 1; }
  .sig-line { border-bottom: 1px solid #aaa; min-height: 32px; margin-top: 4px; }
  .sig-label { font-size: 8pt; color: #888; margin-top: 4px; }
  .prefilled { background: white; color: #111; font-weight: 400; }
  @media print { .page { padding: 40px; } .field-input { background: white; } }
`;

// ─── Onboarding doc ─────────────────────────────────────────────────────────

function generateOnboardingDoc(
  campaign: { name: string; contactName?: string | null; contactEmail?: string | null; onboardingCampaignObjective?: string | null; onboardingKeyMessage?: string | null; onboardingTalkingPoints?: string | null; onboardingCallToAction?: string | null; onboardingTargetAudience?: string | null; onboardingToneGuidelines?: string | null; },
  clientName: string,
  placements: Placement[]
): string {
  const formType = detectFormType(placements);
  const isPodcast = formType === "podcast";

  const prefilledOrBlank = (val: string | null | undefined, cls = "") =>
    val?.trim()
      ? `<div class="field-input ${cls} prefilled">${esc(val)}</div>`
      : `<div class="field-input ${cls}">&nbsp;</div>`;

  const placementBlocks = placements.map((p, i) => `
    <div class="placement-block">
      <div style="font-size:10pt;font-weight:700;margin-bottom:12px;display:flex;justify-content:space-between;align-items:baseline;">
        <span>Placement ${i + 1} — ${esc(p.type)} · ${esc(p.publication)}</span>
        <span style="font-size:8pt;color:#888;font-weight:400;">Run Date: ${formatDate(p.scheduledDate)}</span>
      </div>
      <div class="field-label" style="font-size:9pt;">Notes for this placement</div>
      ${p.onboardingBrief?.trim()
        ? `<div class="field-input prefilled" style="min-height:55px;margin-top:4px;">${esc(p.onboardingBrief)}</div>`
        : `<div class="field-input" style="min-height:55px;margin-top:4px;">&nbsp;</div>`}
    </div>
  `).join("");

  const newsletterFields = `
    <div class="field">
      <div class="field-label">1. Campaign Objective <span style="color:#c00">*</span></div>
      <div class="field-hint">What do you want to accomplish with this advertisement? Be specific.</div>
      ${prefilledOrBlank(campaign.onboardingCampaignObjective, "tall")}
    </div>
    <div class="field">
      <div class="field-label">2. Call to Action <span style="color:#c00">*</span></div>
      <div class="field-hint">What action should readers take? E.g. "Visit our site", "Use code PEAK for 20% off".</div>
      ${prefilledOrBlank(campaign.onboardingCallToAction)}
    </div>
    <div class="field">
      <div class="field-label">3. Anything else we should know? <span style="color:#888;font-weight:400">(optional)</span></div>
      <div class="field-hint">Extra context, brand voice notes, things to avoid, legal disclaimers.</div>
      ${prefilledOrBlank(campaign.onboardingToneGuidelines, "tall")}
    </div>
  `;

  const podcastFields = `
    <div class="field">
      <div class="field-label">1. Campaign Objective <span style="color:#c00">*</span></div>
      <div class="field-hint">What outcome do you want from this campaign?</div>
      ${prefilledOrBlank(campaign.onboardingCampaignObjective)}
    </div>
    <div class="field">
      <div class="field-label">2. Key Message <span style="color:#c00">*</span></div>
      <div class="field-hint">The single most important thing listeners should remember.</div>
      ${prefilledOrBlank(campaign.onboardingKeyMessage)}
    </div>
    <div class="field">
      <div class="field-label">3. Talking Points <span style="color:#c00">*</span></div>
      <div class="field-hint">Key points, claims, proof points, or features the host should mention.</div>
      ${prefilledOrBlank(campaign.onboardingTalkingPoints, "tall")}
    </div>
    <div class="field">
      <div class="field-label">4. Call to Action <span style="color:#c00">*</span></div>
      <div class="field-hint">What should listeners do? Include promo codes, URLs, etc.</div>
      ${prefilledOrBlank(campaign.onboardingCallToAction)}
    </div>
    <div class="field">
      <div class="field-label">5. Target Audience <span style="color:#c00">*</span></div>
      <div class="field-hint">Who are you trying to reach?</div>
      ${prefilledOrBlank(campaign.onboardingTargetAudience)}
    </div>
    <div class="field">
      <div class="field-label">6. Tone / Brand Guidelines <span style="color:#c00">*</span></div>
      <div class="field-hint">Voice, style, or compliance guidance for the host read.</div>
      ${prefilledOrBlank(campaign.onboardingToneGuidelines, "tall")}
    </div>
  `;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${esc(campaign.name)} — ${isPodcast ? "Podcast Script" : "Newsletter Ad"} Onboarding</title>
<style>${SHARED_CSS}</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="brand">The Peak</div>
    <div class="doc-title">${isPodcast ? "Podcast Script" : "Newsletter Ad"} Onboarding</div>
    <div class="doc-subtitle">${isPodcast ? "Complete and return this form so our team can write your host-read podcast script." : "Complete and return this form so our team can draft your newsletter ad copy."}</div>
    <div class="meta-row">
      <div class="meta-field">
        <div class="meta-label">Client / Brand</div>
        <div class="meta-value">${esc(clientName)}</div>
      </div>
      <div class="meta-field">
        <div class="meta-label">Campaign</div>
        <div class="meta-value">${esc(campaign.name)}</div>
      </div>
      <div class="meta-field">
        <div class="meta-label">Date</div>
        <div class="meta-value">${today()}</div>
      </div>
    </div>
    <div class="meta-row">
      <div class="meta-field">
        <div class="meta-label">Contact Name</div>
        <div class="meta-value">${esc(campaign.contactName) || "&nbsp;"}</div>
      </div>
      <div class="meta-field">
        <div class="meta-label">Contact Email</div>
        <div class="meta-value">${esc(campaign.contactEmail) || "&nbsp;"}</div>
      </div>
      <div class="meta-field">
        <div class="meta-label">Completed By</div>
        <div class="meta-value">&nbsp;</div>
      </div>
    </div>
  </div>

  <div class="instructions">
    <strong>How to use this form:</strong> Fill in each field below. When complete, reply to your Peak contact with the filled-in document (or paste your answers by email).${isPodcast ? " All six fields are required." : " <strong>Campaign Objective and Call to Action are required.</strong> Everything else helps us write better copy."}
  </div>

  <div class="section">
    <div class="section-title">${isPodcast ? "Script Direction" : "Campaign Brief"}</div>
    ${isPodcast ? podcastFields : newsletterFields}
  </div>

  ${placements.length > 0 ? `
  <div class="section">
    <div class="section-title">Placement-Specific Notes <span style="font-size:9pt;font-weight:400;color:#888">(optional)</span></div>
    <p style="font-size:10pt;color:#555;margin-top:-10px;margin-bottom:18px;">If you have notes specific to a particular placement — different angle, different audience, different offer — add them here.</p>
    ${placementBlocks}
  </div>
  ` : ""}

  <div class="notice">
    <strong style="color:#111;">Return this form to your Peak contact.</strong> Once we receive your answers, we'll ${isPodcast ? "draft the host-read script and send it for your approval before recording." : "begin drafting your ad copy and send it for your review."}
  </div>

  <div class="footer">
    <div class="sig-block">
      <div class="field-label">Completed by</div>
      <div class="sig-line">&nbsp;</div>
      <div class="sig-label">Name / Title</div>
    </div>
    <div class="sig-block">
      <div class="field-label">Date</div>
      <div class="sig-line">&nbsp;</div>
      <div class="sig-label">Date completed</div>
    </div>
    <div class="sig-block">
      <div class="field-label">Returned to</div>
      <div class="sig-line">&nbsp;</div>
      <div class="sig-label">Peak contact name</div>
    </div>
  </div>
</div>
</body>
</html>`;
}

// ─── Copy review doc ────────────────────────────────────────────────────────

function generateCopyReviewDoc(
  campaign: { name: string; contactName?: string | null; contactEmail?: string | null },
  clientName: string,
  placements: Placement[]
): string {
  const reviewable = placements.filter((p) => p.currentCopy?.trim());

  const summaryRows = placements.map((p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(p.type)}</td>
      <td>${esc(p.publication)}</td>
      <td>${formatDate(p.scheduledDate)}</td>
      <td>v${p.copyVersion}</td>
      <td><span style="display:inline-block;padding:2px 8px;border-radius:3px;font-size:9pt;font-weight:700;background:${p.currentCopy?.trim() ? "#d1fae5" : "#fef3c7"};color:${p.currentCopy?.trim() ? "#065f46" : "#92400e"};">${p.currentCopy?.trim() ? "Ready for Review" : "Copy Pending"}</span></td>
    </tr>
  `).join("");

  const placementCards = placements.map((p, i) => {
    const hasCopy = p.currentCopy?.trim();
    const isPodcast = isPodcastPlacement(p.type, p.publication);
    const requiresLink = !isPodcast;

    return `
    <div style="border:1px solid #ccc;border-radius:5px;margin-bottom:36px;page-break-inside:avoid;">
      <div style="background:#111;color:white;padding:10px 18px;border-radius:4px 4px 0 0;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:11pt;font-weight:700;">Placement ${i + 1} — ${esc(p.type)} · ${esc(p.publication)}</span>
        <span style="font-size:8.5pt;color:#ccc;">Run Date: ${formatDate(p.scheduledDate)} &nbsp;|&nbsp; Version: v${p.copyVersion}</span>
      </div>

      <div style="padding:20px 20px 0 20px;">
        <div style="font-size:8pt;text-transform:uppercase;letter-spacing:.1em;color:#888;font-weight:700;margin-bottom:8px;">Draft Copy</div>
        <div style="background:#f9f9f9;border:1px solid #e0e0e0;border-radius:3px;padding:14px 16px;margin-bottom:20px;line-height:1.65;font-size:11pt;word-wrap:break-word;min-height:60px;">
          ${hasCopy ? formatCopyToHtml(p.currentCopy!) : '<span style="color:#aaa;font-style:italic;">Copy not yet ready.</span>'}
        </div>

        ${requiresLink ? `
        <div style="margin-bottom:20px;">
          <div style="font-size:9.5pt;font-weight:700;margin-bottom:5px;">Destination Link</div>
          <div style="font-size:9pt;color:#888;font-style:italic;margin-bottom:5px;">The URL readers will be sent to when they click the ad. Please confirm or update.</div>
          <div style="border:1px solid #ccc;border-radius:3px;min-height:34px;padding:8px 10px;font-size:11pt;background:white;">${p.linkToPlacement ? `<a href="${esc(p.linkToPlacement)}">${esc(p.linkToPlacement)}</a>` : "&nbsp;"}</div>
        </div>` : ""}
      </div>

      ${hasCopy ? `
      <div style="padding:12px 20px 16px;background:#f0fdf4;border-top:1px solid #bbf7d0;font-size:9.5pt;color:#166534;">
        <strong>To approve:</strong> If this copy looks good, no changes needed — just let us know it's approved.<br>
        <strong>To request edits:</strong> Edit the copy directly above — add, remove, or rewrite anything you'd like changed — then send the updated document back.
      </div>` : `
      <div style="padding:16px 20px;background:#f9f9f9;border-top:1px solid #e0e0e0;">
        <p style="font-size:9.5pt;color:#888;font-style:italic;margin:0;">Copy is still being prepared. This placement will be updated and re-sent for review.</p>
      </div>`}
    </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${esc(campaign.name)} — Copy Review</title>
<style>
${SHARED_CSS}
.summary-table { width:100%;border-collapse:collapse;margin-bottom:32px;font-size:10pt; }
.summary-table th { background:#111;color:white;padding:8px 12px;text-align:left;font-size:9pt;text-transform:uppercase;letter-spacing:.06em; }
.summary-table td { padding:8px 12px;border-bottom:1px solid #e0e0e0;vertical-align:top; }
.summary-table tr:last-child td { border-bottom:none; }
.summary-table tr:nth-child(even) td { background:#f9f9f9; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="brand">The Peak</div>
    <div class="doc-title">Copy Review</div>
    <div class="doc-subtitle">Review the draft copy below. Approve or submit revision notes for each placement.</div>
    <div class="meta-row">
      <div class="meta-field">
        <div class="meta-label">Client / Brand</div>
        <div class="meta-value">${esc(clientName)}</div>
      </div>
      <div class="meta-field">
        <div class="meta-label">Campaign</div>
        <div class="meta-value">${esc(campaign.name)}</div>
      </div>
      <div class="meta-field">
        <div class="meta-label">Date Sent</div>
        <div class="meta-value">${today()}</div>
      </div>
    </div>
    ${campaign.contactName || campaign.contactEmail ? `
    <div class="meta-row">
      <div class="meta-field">
        <div class="meta-label">Contact</div>
        <div class="meta-value">${esc(campaign.contactName) || "&nbsp;"}</div>
      </div>
      <div class="meta-field">
        <div class="meta-label">Email</div>
        <div class="meta-value">${esc(campaign.contactEmail) || "&nbsp;"}</div>
      </div>
      <div class="meta-field"></div>
    </div>` : ""}
  </div>

  <div class="instructions">
    <strong>How to review:</strong> For each placement, read the draft copy carefully. Then either:<br>
    &nbsp;&nbsp;✓ &nbsp;<strong>Approve</strong> — if the copy looks good, let us know it's approved.<br>
    &nbsp;&nbsp;✏️ &nbsp;<strong>Edit directly</strong> — make your changes right in this document, then send the updated version back.<br><br>
    Reply to your Peak contact with the completed document.
  </div>

  <div class="section-title">Placements in This Review</div>
  <table class="summary-table">
    <thead>
      <tr>
        <th>#</th><th>Placement Type</th><th>Publication</th><th>Run Date</th><th>Version</th><th>Status</th>
      </tr>
    </thead>
    <tbody>${summaryRows}</tbody>
  </table>

  ${placementCards}

  <div class="notice">
    <strong style="color:#111;">Please return the completed document to your Peak contact.</strong> If approving all placements, you can reply with "All approved" — but please include revision notes for any placements that need changes.
  </div>
</div>
</body>
</html>`;
}

// ─── Billing onboarding doc ──────────────────────────────────────────────────

function generateBillingDoc(
  campaign: { name: string; contactName?: string | null; contactEmail?: string | null },
  clientName: string,
  billing: {
    primaryContactName?: string | null;
    primaryContactEmail?: string | null;
    companyName?: string | null;
    poNumber?: string | null;
    billingAddress?: string | null;
    billingContactName?: string | null;
    billingContactEmail?: string | null;
    ioSigningContactName?: string | null;
    ioSigningContactEmail?: string | null;
    specialInstructions?: string | null;
    representingClient?: boolean | null;
    wantsPeakCopy?: boolean | null;
  } | null
): string {
  const prefilledOrBlank = (val: string | null | undefined, cls = "") =>
    val?.trim()
      ? `<div class="field-input ${cls} prefilled">${esc(val)}</div>`
      : `<div class="field-input ${cls}">&nbsp;</div>`;

  const yesNoOrBlank = (val: boolean | null | undefined) =>
    val === true ? "Yes" : val === false ? "No" : "";

  const b = billing ?? {};

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${esc(campaign.name)} — Billing Onboarding</title>
<style>${SHARED_CSS}</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="brand">The Peak</div>
    <div class="doc-title">Billing Onboarding</div>
    <div class="doc-subtitle">Share campaign and invoicing details so we can set up your IO and billing.</div>
    <div class="meta-row">
      <div class="meta-field">
        <div class="meta-label">Client / Brand</div>
        <div class="meta-value">${esc(clientName)}</div>
      </div>
      <div class="meta-field">
        <div class="meta-label">Campaign</div>
        <div class="meta-value">${esc(campaign.name)}</div>
      </div>
      <div class="meta-field">
        <div class="meta-label">Date</div>
        <div class="meta-value">${today()}</div>
      </div>
    </div>
  </div>

  <div class="instructions">
    <strong>How to use this form:</strong> Fill in each field below. All fields marked with <span style="color:#c00">*</span> are required. When complete, reply to your Peak contact with the filled-in document.
  </div>

  <div class="section">
    <div class="section-title">Campaign Contact</div>

    <div class="field">
      <div class="field-label">Who is the primary contact for this campaign? <span style="color:#c00">*</span></div>
      ${prefilledOrBlank(b.primaryContactName, "short")}
    </div>

    <div class="field">
      <div class="field-label">Primary contact's email <span style="color:#c00">*</span></div>
      ${prefilledOrBlank(b.primaryContactEmail, "short")}
    </div>

    <div class="field">
      <div class="field-label">Are you representing a client?</div>
      <div class="field-input short ${yesNoOrBlank(b.representingClient) ? "prefilled" : ""}">${yesNoOrBlank(b.representingClient) || "&nbsp;"}</div>
    </div>

    <div class="field">
      <div class="field-label">Would you like for us to produce the copy?</div>
      <div class="field-input short ${yesNoOrBlank(b.wantsPeakCopy) ? "prefilled" : ""}">${yesNoOrBlank(b.wantsPeakCopy) || "&nbsp;"}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Billing Information</div>

    <div class="field">
      <div class="field-label">What full company name should we use on the IO and invoice? <span style="color:#c00">*</span></div>
      ${prefilledOrBlank(b.companyName || b.poNumber, "short")}
    </div>

    <div class="field">
      <div class="field-label">What address should we use on the IO and invoice? <span style="color:#c00">*</span></div>
      ${prefilledOrBlank(b.billingAddress, "tall")}
    </div>

    <div class="field">
      <div class="field-label">Who's the appropriate billing contact? <span style="color:#c00">*</span></div>
      ${prefilledOrBlank(b.billingContactName, "short")}
    </div>

    <div class="field">
      <div class="field-label">Billing contact's email <span style="color:#c00">*</span></div>
      ${prefilledOrBlank(b.billingContactEmail, "short")}
    </div>

    <div class="field">
      <div class="field-label">IO Signing Contact Name <span style="color:#c00">*</span></div>
      ${prefilledOrBlank(b.ioSigningContactName, "short")}
    </div>

    <div class="field">
      <div class="field-label">IO Signing Contact Email <span style="color:#c00">*</span></div>
      ${prefilledOrBlank(b.ioSigningContactEmail, "short")}
    </div>

    <div class="field">
      <div class="field-label">Do you have any specific invoicing instructions? <span style="font-weight:400;color:#888">(optional)</span></div>
      ${prefilledOrBlank(b.specialInstructions, "tall")}
    </div>
  </div>

  <div class="notice">
    <strong style="color:#111;">Return this form to your Peak contact.</strong> Once we receive your details, we'll set up your insertion order and billing.
  </div>

  <div class="footer">
    <div class="sig-block">
      <div class="field-label">Completed by</div>
      <div class="sig-line">&nbsp;</div>
      <div class="sig-label">Name / Title</div>
    </div>
    <div class="sig-block">
      <div class="field-label">Date</div>
      <div class="sig-line">&nbsp;</div>
      <div class="sig-label">Date completed</div>
    </div>
    <div class="sig-block">
      <div class="field-label">Returned to</div>
      <div class="sig-line">&nbsp;</div>
      <div class="sig-label">Peak contact name</div>
    </div>
  </div>
</div>
</body>
</html>`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const { identifier, byId, docType } = parseArgs();

  console.log(`\nSearching for campaign: "${identifier}"...`);
  const row = await findCampaign(identifier, byId);

  if (!row) {
    console.error(`No campaign found for "${identifier}".`);
    process.exit(1);
  }

  const clientName = row.client?.name ?? "Unknown Client";
  const campaign = row as typeof row & {
    contactName?: string | null;
    contactEmail?: string | null;
    onboardingCampaignObjective?: string | null;
    onboardingKeyMessage?: string | null;
    onboardingTalkingPoints?: string | null;
    onboardingCallToAction?: string | null;
    onboardingTargetAudience?: string | null;
    onboardingToneGuidelines?: string | null;
  };

  // Map placements
  const placements: Placement[] = (row.placements ?? []).map((p) => ({
    id: p.id,
    name: p.name ?? "",
    type: p.type as Placement["type"],
    publication: p.publication as Placement["publication"],
    scheduledDate: p.scheduledDate ?? undefined,
    status: p.status as Placement["status"],
    currentCopy: p.currentCopy ?? "",
    copyVersion: p.copyVersion ?? 1,
    revisionNotes: p.revisionNotes ?? undefined,
    revisionHistory: [],
    onboardingBrief: p.onboardingBrief ?? undefined,
    linkToPlacement: p.linkToPlacement ?? undefined,
    imageUrl: p.imageUrl ?? undefined,
    logoUrl: p.logoUrl ?? undefined,
    copyProducer: (p.copyProducer as Placement["copyProducer"]) ?? undefined,
    createdAt: p.createdAt ? String(p.createdAt) : new Date().toISOString(),
  }));

  console.log(`Found: ${row.name} (client: ${clientName}, ${placements.length} placement(s))`);

  let html: string;
  let docLabel: string;

  if (docType === "onboarding") {
    html = generateOnboardingDoc(campaign, clientName, placements);
    const formType = detectFormType(placements);
    docLabel = `onboarding-${formType}`;
  } else if (docType === "billing") {
    html = generateBillingDoc(campaign, clientName, row.billingOnboarding ?? null);
    docLabel = "billing";
  } else {
    html = generateCopyReviewDoc(campaign, clientName, placements);
    docLabel = "copy-review";
  }

  // Write output file
  const outputDir = path.resolve(process.cwd(), "output");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

  const slug = row.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const filename = `${slug}-${docLabel}-${today()}.html`;
  const outputPath = path.join(outputDir, filename);
  fs.writeFileSync(outputPath, html, "utf8");

  console.log(`\n✓ Generated: output/${filename}`);
  console.log(`  Open in Word: File → Open → select the file, then Save As .docx`);
  console.log(`  Or open in browser and print to PDF\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
