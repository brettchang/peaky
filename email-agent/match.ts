import type { DashboardCampaign } from "../lib/types";
import type { CampaignMatch } from "./types";

function resolveInternalDomains(): string[] {
  if (process.env.EMAIL_AGENT_ALLOW_INTERNAL_SENDERS === "true") {
    return [];
  }
  const raw =
    process.env.EMAIL_AGENT_INTERNAL_DOMAINS?.trim() ||
    process.env.CAMPAIGN_EMAIL_INTERNAL_DOMAINS?.trim() ||
    "thepeakmediaco.com";
  return raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

export function isInternalEmail(email: string): boolean {
  const parts = email.split("@");
  if (parts.length !== 2) return false;
  const domains = resolveInternalDomains();
  return domains.includes(parts[1].toLowerCase());
}

export function matchSenderToCampaigns(
  senderEmail: string,
  allCampaigns: DashboardCampaign[]
): CampaignMatch[] {
  const normalizedSender = senderEmail.toLowerCase().trim();
  if (!normalizedSender || isInternalEmail(normalizedSender)) return [];

  const matches: CampaignMatch[] = [];
  const seen = new Set<string>();

  for (const { campaign, clientName } of allCampaigns) {
    if (seen.has(campaign.id)) continue;

    // Check primary contact email
    if (campaign.contactEmail?.toLowerCase() === normalizedSender) {
      seen.add(campaign.id);
      matches.push({ campaign, clientName, matchedVia: "contactEmail" });
      continue;
    }

    // Check contacts array
    if (campaign.contacts?.some((c) => c.email.toLowerCase() === normalizedSender)) {
      seen.add(campaign.id);
      matches.push({ campaign, clientName, matchedVia: "contacts" });
      continue;
    }

    // Check billing onboarding contacts
    if (campaign.billingOnboarding?.billingContactEmail?.toLowerCase() === normalizedSender) {
      seen.add(campaign.id);
      matches.push({ campaign, clientName, matchedVia: "billingContact" });
      continue;
    }

    if (campaign.billingOnboarding?.ioSigningContactEmail?.toLowerCase() === normalizedSender) {
      seen.add(campaign.id);
      matches.push({ campaign, clientName, matchedVia: "ioSigningContact" });
      continue;
    }
  }

  return matches;
}
