import { getCampaignLookup } from "./db";
import type { EmailParticipant, EmailThreadLinkInput } from "./types";

function normalizeEmail(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function normalizeSubject(value: string | undefined): string {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export async function matchThreadToCampaigns(input: {
  participants: EmailParticipant[];
  subject?: string;
  previousCampaignIds?: string[];
  portalUrls?: string[];
}): Promise<EmailThreadLinkInput[]> {
  const campaigns = await getCampaignLookup();
  const participantEmails = new Set(
    input.participants.map((participant) => normalizeEmail(participant.email)).filter(Boolean)
  );
  const normalizedSubject = normalizeSubject(input.subject);
  const links: EmailThreadLinkInput[] = [];

  for (const entry of campaigns) {
    let confidence = 0;
    const reasons: string[] = [];
    const campaign = entry.campaign;
    const contactEmails = new Set(
      [
        campaign.contactEmail,
        ...(campaign.contacts?.map((contact) => contact.email) ?? []),
        campaign.billingOnboarding?.billingContactEmail,
        campaign.billingOnboarding?.ioSigningContactEmail,
      ]
        .map(normalizeEmail)
        .filter(Boolean)
    );

    const intersectingContacts = Array.from(participantEmails).filter((email) =>
      contactEmails.has(email)
    );
    if (intersectingContacts.length > 0) {
      confidence += 75;
      reasons.push(`Matched thread participants to campaign contacts: ${intersectingContacts.join(", ")}`);
    }

    const normalizedCampaignName = normalizeSubject(campaign.name);
    if (normalizedSubject && normalizedCampaignName && normalizedSubject.includes(normalizedCampaignName)) {
      confidence += 20;
      reasons.push("Subject line references the campaign name.");
    }

    if (input.portalUrls?.some((url) => url.includes(campaign.id) || url.includes(campaign.portalId))) {
      confidence += 10;
      reasons.push("Thread references a portal or campaign URL.");
    }

    if (input.previousCampaignIds?.includes(campaign.id)) {
      confidence += 10;
      reasons.push("Thread was previously linked to this campaign.");
    }

    if (confidence === 0) continue;
    links.push({
      campaignId: campaign.id,
      confidence: Math.min(confidence, 100),
      isPrimary: false,
      matchReason: reasons.join(" "),
      source: "auto",
      metadata: {
        participantEmails: intersectingContacts,
        clientName: entry.clientName,
      },
    });
  }

  links.sort((a, b) => b.confidence - a.confidence);
  return links.map((link, index) => ({
    ...link,
    isPrimary: index === 0,
  }));
}
