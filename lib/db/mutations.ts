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
import { DAILY_CAPACITY_LIMITS } from "../types";
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

// ─── Bulk scheduling ────────────────────────────────────────

export interface BulkScheduleAssignment {
  campaignId: string;
  placementId: string;
  scheduledDate: string;
}

export interface BulkScheduleResult {
  success: boolean;
  scheduled: number;
  errors: { placementId: string; error: string }[];
}

export async function bulkSchedulePlacements(
  assignments: BulkScheduleAssignment[]
): Promise<BulkScheduleResult> {
  const errors: { placementId: string; error: string }[] = [];
  let scheduled = 0;

  for (const assignment of assignments) {
    const { campaignId, placementId, scheduledDate } = assignment;

    // Validate weekday
    const dateObj = new Date(scheduledDate + "T00:00:00");
    const day = dateObj.getDay();
    if (day === 0 || day === 6) {
      errors.push({ placementId, error: "Date must be a weekday" });
      continue;
    }

    // Get the placement to check its type and publication
    const placement = await getPlacement(campaignId, placementId);
    if (!placement) {
      errors.push({ placementId, error: "Placement not found" });
      continue;
    }

    // Check capacity at write time for capped types
    const limit = DAILY_CAPACITY_LIMITS[placement.type];
    if (limit !== null) {
      const existing = await db
        .select({ id: schema.placements.id })
        .from(schema.placements)
        .where(
          and(
            eq(schema.placements.scheduledDate, scheduledDate),
            eq(schema.placements.type, placement.type),
            eq(schema.placements.publication, placement.publication)
          )
        );

      if (existing.length >= limit) {
        errors.push({
          placementId,
          error: `${placement.type} is full on ${scheduledDate} for ${placement.publication} (${existing.length}/${limit})`,
        });
        continue;
      }
    }

    // Perform the update
    const result = await db
      .update(schema.placements)
      .set({ scheduledDate })
      .where(
        and(
          eq(schema.placements.id, placementId),
          eq(schema.placements.campaignId, campaignId)
        )
      );

    if ((result.rowCount ?? 0) > 0) {
      scheduled++;
    } else {
      errors.push({ placementId, error: "Failed to update placement" });
    }
  }

  return {
    success: errors.length === 0,
    scheduled,
    errors,
  };
}

// ─── Campaign deletion ───────────────────────────────────────

export async function deleteCampaign(campaignId: string): Promise<boolean> {
  const result = await db
    .delete(schema.campaigns)
    .where(eq(schema.campaigns.id, campaignId));
  return (result.rowCount ?? 0) > 0;
}

// ─── Settings mutations ──────────────────────────────────────

export async function upsertSetting(key: string, value: string): Promise<void> {
  await db
    .insert(schema.appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value, updatedAt: new Date() },
    });
}

// ─── Onboarding mutations ────────────────────────────────────

export async function saveOnboardingForm(
  campaignId: string,
  data: {
    messaging?: string;
    desiredAction?: string;
    placementBriefs?: { placementId: string; brief: string; link?: string }[];
  }
): Promise<boolean> {
  // Save campaign-level fields
  await db
    .update(schema.campaigns)
    .set({
      onboardingMessaging: data.messaging ?? null,
      onboardingDesiredAction: data.desiredAction ?? null,
    })
    .where(eq(schema.campaigns.id, campaignId));

  // Save per-placement briefs and links
  if (data.placementBriefs) {
    for (const { placementId, brief, link } of data.placementBriefs) {
      const updates: Record<string, string | null> = {
        onboardingBrief: brief || null,
      };
      if (link !== undefined) {
        updates.linkToPlacement = link || null;
      }
      await db
        .update(schema.placements)
        .set(updates)
        .where(
          and(
            eq(schema.placements.id, placementId),
            eq(schema.placements.campaignId, campaignId)
          )
        );
    }
  }

  return true;
}

export async function submitOnboardingForm(
  campaignId: string,
  roundId: string,
  data: {
    messaging: string;
    desiredAction: string;
    placementBriefs: { placementId: string; brief: string; link?: string }[];
  }
): Promise<boolean> {
  await saveOnboardingForm(campaignId, data);

  // Mark the round complete
  await db
    .update(schema.onboardingRounds)
    .set({ complete: true })
    .where(eq(schema.onboardingRounds.id, roundId));

  // Set campaign-level submitted timestamp (first submission) and transition status
  const campaign = await db.query.campaigns.findFirst({
    where: eq(schema.campaigns.id, campaignId),
  });
  if (campaign) {
    const updates: Record<string, unknown> = {};
    if (!campaign.onboardingSubmittedAt) {
      updates.onboardingSubmittedAt = new Date();
    }
    if (campaign.status === "Waiting on Onboarding") {
      updates.status = "Onboarding Form Complete" satisfies CampaignStatus;
    }
    if (Object.keys(updates).length > 0) {
      await db
        .update(schema.campaigns)
        .set(updates)
        .where(eq(schema.campaigns.id, campaignId));
    }
  }

  return true;
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
