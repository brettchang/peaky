import { eq, and } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { db } from "./index";
import * as schema from "./schema";
import { generatePortalId } from "../client-ids";
import type {
  Campaign,
  Placement,
  OnboardingRound,
  AdLineItem,
  InvoiceCadence,
  PlacementStatus,
  PlacementType,
  Publication,
  CampaignStatus,
  PerformanceStats,
} from "../types";
import { getCampaignById, getPlacement } from "./queries";

const nanoid = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 10);

function genId(prefix: string): string {
  return `${prefix}-${nanoid()}`;
}

// ─── Mutations ───────────────────────────────────────────────

export async function updatePlacementStatus(
  campaignId: string,
  placementId: string,
  status: PlacementStatus
): Promise<boolean> {
  const result = await db
    .update(schema.placements)
    .set({ status })
    .where(
      and(
        eq(schema.placements.id, placementId),
        eq(schema.placements.campaignId, campaignId)
      )
    );
  return (result.rowCount ?? 0) > 0;
}

export async function savePlacementRevisionNotes(
  campaignId: string,
  placementId: string,
  notes: string
): Promise<boolean> {
  const result = await db
    .update(schema.placements)
    .set({
      revisionNotes: notes,
      status: "Copywriting in Progress",
    })
    .where(
      and(
        eq(schema.placements.id, placementId),
        eq(schema.placements.campaignId, campaignId)
      )
    );
  return (result.rowCount ?? 0) > 0;
}

export async function updatePlacementCopy(
  campaignId: string,
  placementId: string,
  newCopy: string
): Promise<boolean> {
  const placement = await getPlacement(campaignId, placementId);
  if (!placement) return false;

  // Insert current copy into revision history
  await db.insert(schema.copyVersions).values({
    id: genId("cv"),
    placementId,
    version: placement.copyVersion,
    copyText: placement.currentCopy,
    revisionNotes: placement.revisionNotes,
    createdAt: new Date(),
  });

  // Update placement with new copy
  await db
    .update(schema.placements)
    .set({
      currentCopy: newCopy,
      copyVersion: placement.copyVersion + 1,
      revisionNotes: null,
    })
    .where(eq(schema.placements.id, placementId));

  return true;
}

export async function updatePlacementScheduledDate(
  campaignId: string,
  placementId: string,
  scheduledDate: string | null
): Promise<boolean> {
  const result = await db
    .update(schema.placements)
    .set({ scheduledDate })
    .where(
      and(
        eq(schema.placements.id, placementId),
        eq(schema.placements.campaignId, campaignId)
      )
    );
  return (result.rowCount ?? 0) > 0;
}

export async function updatePlacementLink(
  campaignId: string,
  placementId: string,
  linkToPlacement: string
): Promise<boolean> {
  const result = await db
    .update(schema.placements)
    .set({ linkToPlacement })
    .where(
      and(
        eq(schema.placements.id, placementId),
        eq(schema.placements.campaignId, campaignId)
      )
    );
  return (result.rowCount ?? 0) > 0;
}

export function createOnboardingRound(
  campaignId: string,
  label?: string
): Promise<OnboardingRound | null> {
  return (async () => {
    // Verify campaign exists
    const campaign = await db.query.campaigns.findFirst({
      where: eq(schema.campaigns.id, campaignId),
    });
    if (!campaign) return null;

    const id = genId("round");
    const now = new Date();

    await db.insert(schema.onboardingRounds).values({
      id,
      campaignId,
      label: label ?? null,
      filloutLink: `https://thepeakquiz.fillout.com/t/uDNyXt4Ttsus?campaign_id=${campaignId}&round_id=${id}`,
      complete: false,
      createdAt: now,
    });

    return {
      id,
      label,
      filloutLink: `https://thepeakquiz.fillout.com/t/uDNyXt4Ttsus?campaign_id=${campaignId}&round_id=${id}`,
      complete: false,
      createdAt: now.toISOString(),
    };
  })();
}

export function createCampaign(data: {
  clientName: string;
  name: string;
  campaignManager?: string;
  contactName?: string;
  contactEmail?: string;
  adLineItems?: AdLineItem[];
  notes?: string;
}): Promise<Campaign> {
  return (async () => {
    const client = await findOrCreateClient(data.clientName);
    const campaignId = genId("campaign");
    const now = new Date();

    // Insert campaign
    await db.insert(schema.campaigns).values({
      id: campaignId,
      name: data.name,
      clientId: client.id,
      status: "Waiting on Onboarding",
      campaignManager: data.campaignManager ?? null,
      contactName: data.contactName ?? null,
      contactEmail: data.contactEmail ?? null,
      adLineItems: data.adLineItems ?? null,
      notes: data.notes ?? null,
      createdAt: now,
    });

    // Create billing onboarding
    await db.insert(schema.billingOnboarding).values({
      id: genId("billing"),
      campaignId,
      filloutLink: `https://thepeakquiz.fillout.com/t/uDNyXt4Ttsus?campaign_id=${campaignId}&form_type=billing`,
      complete: false,
    });

    // Create initial onboarding round
    const firstRound = await createOnboardingRound(campaignId, "Initial Round");

    // Auto-create placements from ad line items
    if (data.adLineItems) {
      for (const lineItem of data.adLineItems) {
        for (let i = 0; i < lineItem.quantity; i++) {
          await addPlacement(campaignId, {
            type: lineItem.type,
            publication: "The Peak",
            status: "New Campaign",
            onboardingRoundId: firstRound?.id,
          });
        }
      }
    }

    // Fetch and return the full campaign
    const campaign = await getCampaignById(campaignId);
    return campaign!;
  })();
}

export function markOnboardingComplete(
  campaignId: string,
  roundId?: string
): Promise<boolean> {
  return (async () => {
    const campaign = await db.query.campaigns.findFirst({
      where: eq(schema.campaigns.id, campaignId),
      with: { onboardingRounds: true },
    });
    if (!campaign) return false;

    let round: (typeof campaign.onboardingRounds)[number] | undefined;
    if (roundId) {
      round = campaign.onboardingRounds.find((r) => r.id === roundId);
    } else {
      round = campaign.onboardingRounds.find((r) => !r.complete);
    }
    if (!round) return false;

    await db
      .update(schema.onboardingRounds)
      .set({ complete: true })
      .where(eq(schema.onboardingRounds.id, round.id));

    // Only transition campaign status on first round completion
    if (campaign.status === "Waiting on Onboarding") {
      await db
        .update(schema.campaigns)
        .set({ status: "Onboarding Form Complete" satisfies CampaignStatus })
        .where(eq(schema.campaigns.id, campaignId));
    }

    return true;
  })();
}

export function markBillingOnboardingComplete(
  campaignId: string,
  data: {
    billingContactName?: string;
    billingContactEmail?: string;
    billingAddress?: string;
    poNumber?: string;
    invoiceCadence?: InvoiceCadence;
    specialInstructions?: string;
  }
): Promise<boolean> {
  return (async () => {
    const billing = await db.query.billingOnboarding.findFirst({
      where: eq(schema.billingOnboarding.campaignId, campaignId),
    });
    if (!billing) return false;

    await db
      .update(schema.billingOnboarding)
      .set({
        complete: true,
        completedAt: new Date(),
        billingContactName: data.billingContactName ?? null,
        billingContactEmail: data.billingContactEmail ?? null,
        billingAddress: data.billingAddress ?? null,
        poNumber: data.poNumber ?? null,
        invoiceCadence: data.invoiceCadence ?? null,
        specialInstructions: data.specialInstructions ?? null,
      })
      .where(eq(schema.billingOnboarding.id, billing.id));

    return true;
  })();
}

export function updateAdLineItems(
  campaignId: string,
  adLineItems: AdLineItem[]
): Promise<boolean> {
  return (async () => {
    const result = await db
      .update(schema.campaigns)
      .set({ adLineItems })
      .where(eq(schema.campaigns.id, campaignId));
    return (result.rowCount ?? 0) > 0;
  })();
}

export function addPlacement(
  campaignId: string,
  data: {
    type: PlacementType;
    publication: Publication;
    scheduledDate?: string;
    copyProducer?: "Us" | "Client";
    status: PlacementStatus;
    notes?: string;
    onboardingRoundId?: string;
  }
): Promise<Placement | null> {
  return (async () => {
    const campaign = await db.query.campaigns.findFirst({
      where: eq(schema.campaigns.id, campaignId),
    });
    if (!campaign) return null;

    const id = genId("placement");
    const now = new Date();

    await db.insert(schema.placements).values({
      id,
      campaignId,
      name: `${campaign.name} — ${data.type}`,
      type: data.type,
      publication: data.publication,
      scheduledDate: data.scheduledDate ?? null,
      status: data.status,
      onboardingRoundId: data.onboardingRoundId ?? null,
      copyProducer: data.copyProducer ?? null,
      notes: data.notes ?? null,
      currentCopy: "",
      copyVersion: 0,
      createdAt: now,
    });

    return {
      id,
      name: `${campaign.name} — ${data.type}`,
      type: data.type,
      publication: data.publication,
      scheduledDate: data.scheduledDate,
      status: data.status,
      onboardingRoundId: data.onboardingRoundId,
      copyProducer: data.copyProducer,
      notes: data.notes,
      currentCopy: "",
      copyVersion: 0,
      revisionHistory: [],
      createdAt: now.toISOString(),
    };
  })();
}

export async function publishPlacementToBeehiiv(
  campaignId: string,
  placementId: string
): Promise<{ beehiivPostId: string } | null> {
  const placement = await getPlacement(campaignId, placementId);
  if (!placement || placement.status !== "Approved") return null;

  const beehiivPostId = `post_${placementId}_${Date.now()}`;
  const now = new Date();

  await db
    .update(schema.placements)
    .set({
      beehiivPostId,
      publishedAt: now,
      status: "Done",
    })
    .where(eq(schema.placements.id, placementId));

  return { beehiivPostId };
}

export async function updatePlacementOnboardingRound(
  campaignId: string,
  placementId: string,
  onboardingRoundId: string | null
): Promise<boolean> {
  const result = await db
    .update(schema.placements)
    .set({ onboardingRoundId })
    .where(
      and(
        eq(schema.placements.id, placementId),
        eq(schema.placements.campaignId, campaignId)
      )
    );
  return (result.rowCount ?? 0) > 0;
}

export async function updateCampaignMetadata(
  campaignId: string,
  data: {
    name?: string;
    status?: CampaignStatus;
    campaignManager?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    notes?: string | null;
  }
): Promise<boolean> {
  const result = await db
    .update(schema.campaigns)
    .set(data)
    .where(eq(schema.campaigns.id, campaignId));
  return (result.rowCount ?? 0) > 0;
}

export async function updatePlacementMetadata(
  campaignId: string,
  placementId: string,
  data: {
    name?: string;
    type?: PlacementType;
    publication?: Publication;
    scheduledDate?: string | null;
    status?: PlacementStatus;
    copyProducer?: "Us" | "Client" | null;
    notes?: string | null;
    linkToPlacement?: string | null;
    conflictPreference?: "Defer if conflict" | "Date is crucial" | null;
    imageUrl?: string | null;
    logoUrl?: string | null;
  }
): Promise<boolean> {
  const result = await db
    .update(schema.placements)
    .set(data)
    .where(
      and(
        eq(schema.placements.id, placementId),
        eq(schema.placements.campaignId, campaignId)
      )
    );
  return (result.rowCount ?? 0) > 0;
}

export async function syncPlacementBeehiivStats(
  placementId: string,
  beehiivPostId: string,
  stats: PerformanceStats
): Promise<boolean> {
  const result = await db
    .update(schema.placements)
    .set({ beehiivPostId, stats })
    .where(eq(schema.placements.id, placementId));
  return (result.rowCount ?? 0) > 0;
}

// ─── Internal helpers ────────────────────────────────────────

async function findOrCreateClient(name: string): Promise<{ id: string; name: string; portalId: string }> {
  const trimmed = name.trim();
  const existing = await db.query.clients.findFirst({
    where: eq(schema.clients.name, trimmed),
  });
  if (existing) return existing;

  const id = genId("client");
  const portalId = generatePortalId();

  await db.insert(schema.clients).values({
    id,
    name: trimmed,
    portalId,
  });

  return { id, name: trimmed, portalId };
}
