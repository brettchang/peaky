import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCapacityForDateRange } from "../lib/db";
import type { CampaignMatch } from "./types";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));

export function buildCampaignContext(match: CampaignMatch): string {
  const { campaign, clientName } = match;
  const lines: string[] = [
    `## Campaign: ${campaign.name}`,
    `Client: ${clientName}`,
    `Status: ${campaign.status}`,
    `Campaign Manager: ${campaign.campaignManager}`,
  ];

  if (campaign.contactName) lines.push(`Contact: ${campaign.contactName} (${campaign.contactEmail})`);
  if (campaign.placementsDescription) lines.push(`Placements Description: ${campaign.placementsDescription}`);

  if (campaign.adLineItems && campaign.adLineItems.length > 0) {
    lines.push(`\nAd Line Items:`);
    for (const item of campaign.adLineItems) {
      lines.push(`  - ${item.quantity}x ${item.type}${item.publication ? ` (${item.publication})` : ""} @ $${item.pricePerUnit}/ea`);
    }
  }

  if (campaign.placements.length > 0) {
    lines.push(`\nPlacements (${campaign.placements.length} total):`);
    for (const p of campaign.placements) {
      const datePart = p.scheduledDate ? ` | Scheduled: ${p.scheduledDate}` : "";
      lines.push(`  - ${p.name} [${p.type}] (${p.publication}) — Status: ${p.status}${datePart}`);
    }
  }

  if (campaign.onboardingRounds.length > 0) {
    const completed = campaign.onboardingRounds.filter((r) => r.complete).length;
    lines.push(`\nOnboarding: ${completed}/${campaign.onboardingRounds.length} rounds complete`);
  }

  if (campaign.billingOnboarding) {
    lines.push(`Billing Onboarding: ${campaign.billingOnboarding.complete ? "Complete" : "Pending"}`);
  }

  return lines.join("\n");
}

export async function buildCapacityContext(
  startDate: string,
  endDate: string
): Promise<string> {
  const capacity = await getCapacityForDateRange(startDate, endDate);
  const lines: string[] = [
    `## Scheduling Capacity (${startDate} to ${endDate})`,
  ];

  for (const day of capacity.days) {
    const availableSlots = day.slots.filter((s) => s.available !== null && s.available > 0);
    if (availableSlots.length === 0) {
      lines.push(`${day.date}: Fully booked`);
      continue;
    }
    const slotDescriptions = availableSlots.map(
      (s) => `${s.type} in ${s.publication}: ${s.available}/${s.limit} available`
    );
    lines.push(`${day.date}: ${slotDescriptions.join(", ")}`);
  }

  return lines.join("\n");
}

export async function loadKnowledgeBase(): Promise<string> {
  try {
    const knowledgePath = path.join(THIS_DIR, "knowledge.md");
    return await readFile(knowledgePath, "utf8");
  } catch {
    return "Knowledge base not available.";
  }
}
