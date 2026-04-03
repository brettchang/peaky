import { eq, and, isNull } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { db } from "./index";
import * as schema from "./schema";
import { generatePortalId } from "../client-ids";
import type {
  Campaign,
  CampaignManager,
  Placement,
  OnboardingRound,
  AdLineItem,
  InvoiceCadence,
  PlacementStatus,
  PlacementType,
  Publication,
  CampaignStatus,
  PerformanceStats,
  CampaignContact,
  CampaignCurrency,
  CampaignCategory,
  OnboardingFormType,
} from "../types";
import {
  CAMPAIGN_MANAGERS,
  DAILY_CAPACITY_LIMITS,
  getDefaultPlacementStatus,
  getOnboardingFormTypeForPlacement,
  isCampaignManager,
  isPodcastPlacement,
  isValidPlacementPublication,
  isPodcastInterviewType,
  isPodcastPublication,
} from "../types";
import { getTodayDateKey, isPastDateKey } from "../schedule-capacity";
import { getCampaignById, getPlacement } from "./queries";
import { attachPlacementMeta, extractPlacementMeta } from "../placement-meta";
import { getPortalBaseUrl } from "../urls";
import type { DashboardInvoiceStatus } from "../xero-types";
import {
  attachCampaignManagerNotes,
  extractCampaignManagerNotes,
} from "../campaign-manager-notes";

const nanoid = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 10);

function genId(prefix: string): string {
  return `${prefix}-${nanoid()}`;
}

function buildCampaignFormLink(portalId: string, campaignId: string): string {
  return `${getPortalBaseUrl()}/portal/${portalId}/${campaignId}`;
}

async function assertPlacementDateAllowed(
  scheduledDate: string,
  type: PlacementType,
  publication: Publication,
  ignorePlacementId?: string,
  options?: {
    allowHistoricalDateOverride?: boolean;
  }
): Promise<void> {
  if (options?.allowHistoricalDateOverride && isPastDateKey(scheduledDate, getTodayDateKey())) {
    return;
  }

  const dateObj = new Date(`${scheduledDate}T00:00:00`);
  const dayOfWeek = dateObj.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    throw new Error("Placement dates must be weekdays");
  }

  const limit = DAILY_CAPACITY_LIMITS[type];
  if (limit === null) return;

  const existing = await db
    .select({ id: schema.placements.id })
    .from(schema.placements)
    .where(
      and(
        eq(schema.placements.scheduledDate, scheduledDate),
        eq(schema.placements.type, type),
        eq(schema.placements.publication, publication)
      )
    );

  const used = ignorePlacementId
    ? existing.filter((row) => row.id !== ignorePlacementId).length
    : existing.length;

  if (used >= limit) {
    throw new Error(
      `${type} is full on ${scheduledDate} for ${publication} (${used}/${limit})`
    );
  }
}

const BILLING_META_START = "<!-- billing-meta:start -->";
const BILLING_META_END = "<!-- billing-meta:end -->";

interface BillingPortalMeta {
  representingClient?: boolean;
  wantsPeakCopy?: boolean;
  salesPerson?: string;
  contacts?: CampaignContact[];
  longTermClient?: boolean;
  complementaryCampaign?: boolean;
}

function extractBillingPortalMeta(notes?: string | null): {
  cleanNotes: string | null;
  meta: BillingPortalMeta;
} {
  if (!notes) return { cleanNotes: null, meta: {} };

  const start = notes.lastIndexOf(BILLING_META_START);
  const end =
    start === -1 ? -1 : notes.indexOf(BILLING_META_END, start);
  if (start === -1 || end === -1 || end < start) {
    return { cleanNotes: notes.trim() || null, meta: {} };
  }

  const rawMeta = notes
    .slice(start + BILLING_META_START.length, end)
    .trim();

  let meta: BillingPortalMeta = {};
  try {
    meta = JSON.parse(rawMeta) as BillingPortalMeta;
  } catch {
    meta = {};
  }

  const cleanNotes =
    notes
      .replace(
        /<!-- billing-meta:start -->[\s\S]*?<!-- billing-meta:end -->/g,
        ""
      )
      .trim() || null;
  return { cleanNotes, meta };
}

function attachBillingPortalMeta(
  cleanNotes: string | null,
  meta: BillingPortalMeta
): string {
  const hasMeta = Object.values(meta).some((value) => {
    if (value === undefined || value === null || value === "") return false;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  });
  if (!hasMeta) return cleanNotes ?? "";

  const block = `${BILLING_META_START}\n${JSON.stringify(meta)}\n${BILLING_META_END}`;
  if (!cleanNotes) return block;
  return `${cleanNotes}\n\n${block}`;
}

// ─── Mutations ───────────────────────────────────────────────

export async function updatePlacementStatus(
  campaignId: string,
  placementId: string,
  status: PlacementStatus
): Promise<boolean> {
  const campaign = await db.query.campaigns.findFirst({
    where: eq(schema.campaigns.id, campaignId),
  });
  const nextStatus: PlacementStatus =
    campaign?.category === "Evergreen" ? "Approved" : status;

  const result = await db
    .update(schema.placements)
    .set({ status: nextStatus })
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
  const placement = await getPlacement(campaignId, placementId);
  if (!placement) return false;
  const campaign = await db.query.campaigns.findFirst({
    where: eq(schema.campaigns.id, campaignId),
  });

  const nextStatus: PlacementStatus =
    campaign?.category === "Evergreen"
      ? "Approved"
      : placement.status === "Client Reviewing Interview"
      ? "Revising for Client"
      : placement.status === "Audio Sent for Approval" ||
          placement.status === "Audio Sent"
        ? "Audio Sent"
      : placement.status === "Script Review by Client"
        ? "Drafting Script"
        : placement.status === "Questions In Review"
          ? "Drafting Questions"
          : "Copywriting in Progress";

  const result = await db
    .update(schema.placements)
    .set({
      revisionNotes: notes,
      status: nextStatus,
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

  // No-op update: avoid creating redundant versions.
  if (newCopy === placement.currentCopy) return true;

  // Insert current copy into revision history. If legacy data already
  // contains this version, skip the insert rather than failing the save.
  await db
    .insert(schema.copyVersions)
    .values({
      id: genId("cv"),
      placementId,
      version: placement.copyVersion,
      copyText: placement.currentCopy,
      revisionNotes: placement.revisionNotes,
      createdAt: new Date(),
    })
    .onConflictDoNothing({
      target: [schema.copyVersions.placementId, schema.copyVersions.version],
    });

  // Update placement with new copy
  const result = await db
    .update(schema.placements)
    .set({
      currentCopy: newCopy,
      copyVersion: placement.copyVersion + 1,
      revisionNotes: null,
    })
    .where(
      and(
        eq(schema.placements.id, placementId),
        eq(schema.placements.campaignId, campaignId)
      )
    );

  return (result.rowCount ?? 0) > 0;
}

export async function updatePlacementScheduledDate(
  campaignId: string,
  placementId: string,
  scheduledDate: string | null,
  options?: {
    historicalDateOverride?: boolean;
  }
): Promise<boolean> {
  if (scheduledDate) {
    const placement = await getPlacement(campaignId, placementId);
    if (!placement) return false;
    await assertPlacementDateAllowed(
      scheduledDate,
      placement.type,
      placement.publication,
      placementId,
      { allowHistoricalDateOverride: options?.historicalDateOverride === true }
    );
  }

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
  label?: string,
  formType: OnboardingFormType = "newsletter"
): Promise<OnboardingRound | null> {
  return (async () => {
    // Verify campaign exists
    const campaign = await db.query.campaigns.findFirst({
      where: eq(schema.campaigns.id, campaignId),
      with: {
        client: true,
      },
    });
    if (!campaign) return null;

    const id = genId("round");
    const now = new Date();
    const formLink = buildCampaignFormLink(campaign.portalId, campaignId);

    await db.insert(schema.onboardingRounds).values({
      id,
      campaignId,
      label: label ?? null,
      formType,
      formLink,
      complete: false,
      createdAt: now,
    });

    return {
      id,
      label,
      formType,
      formLink,
      complete: false,
      createdAt: now.toISOString(),
    };
  })();
}

export async function updateOnboardingRoundLabel(
  campaignId: string,
  roundId: string,
  label?: string
): Promise<boolean> {
  const normalizedLabel = label?.trim() || null;
  const result = await db
    .update(schema.onboardingRounds)
    .set({ label: normalizedLabel })
    .where(
      and(
        eq(schema.onboardingRounds.id, roundId),
        eq(schema.onboardingRounds.campaignId, campaignId)
      )
    );

  return (result.rowCount ?? 0) > 0;
}

export function createCampaign(data: {
  clientName: string;
  name: string;
  category?: CampaignCategory;
  salesPerson?: string;
  campaignManager: CampaignManager;
  currency?: CampaignCurrency;
  taxEligible?: boolean;
  contactName?: string;
  contactEmail?: string;
  contacts?: CampaignContact[];
  adLineItems?: AdLineItem[];
  notes?: string;
}): Promise<Campaign> {
  return (async () => {
    if (!isCampaignManager(data.campaignManager)) {
      throw new Error(
        `campaignManager must be one of: ${CAMPAIGN_MANAGERS.join(", ")}`
      );
    }

    if (data.adLineItems) {
      for (const lineItem of data.adLineItems) {
        const publication = lineItem.publication ?? "The Peak";
        if (!isValidPlacementPublication(lineItem.type, publication)) {
          throw new Error(
            `Invalid type/publication combination: ${lineItem.type} + ${publication}`
          );
        }
      }
    }

    const client = await findOrCreateClient(data.clientName);
    const campaignId = genId("campaign");
    const campaignPortalId = generatePortalId();
    const now = new Date();
    const isEvergreen = data.category === "Evergreen";

    // Insert campaign
    const notesWithMeta = attachBillingPortalMeta(data.notes ?? null, {
      salesPerson: data.salesPerson,
      contacts: data.contacts,
    });

    const primaryContact =
      data.contacts && data.contacts.length > 0
        ? data.contacts[0]
        : undefined;

    await db.insert(schema.campaigns).values({
      id: campaignId,
      name: data.name,
      portalId: campaignPortalId,
      clientId: client.id,
      category: data.category ?? "Standard",
      status: isEvergreen ? "Active" : "Onboarding to be sent",
      campaignManager: data.campaignManager,
      currency: data.currency ?? "CAD",
      taxEligible: data.taxEligible ?? true,
      contactName: primaryContact?.name ?? data.contactName ?? null,
      contactEmail: primaryContact?.email ?? data.contactEmail ?? null,
      adLineItems: data.adLineItems ?? null,
      notes: notesWithMeta || null,
      createdAt: now,
    });

    let firstRound: OnboardingRound | null = null;
    let firstRoundFormType: OnboardingFormType = "newsletter";
    if (!isEvergreen) {
      if (data.adLineItems && data.adLineItems.length > 0) {
        const allPodcast = data.adLineItems.every((lineItem) =>
          isPodcastPlacement(lineItem.type, lineItem.publication ?? "The Peak")
        );
        firstRoundFormType = allPodcast ? "podcast" : "newsletter";
      }

      // Create billing onboarding
      await db.insert(schema.billingOnboarding).values({
        id: genId("billing"),
        campaignId,
        formLink: buildCampaignFormLink(campaignPortalId, campaignId),
        complete: false,
      });

      // Create initial onboarding round
      firstRound = await createOnboardingRound(
        campaignId,
        "Initial Copy Round",
        firstRoundFormType
      );
    }

    // Auto-create placements from ad line items
    if (data.adLineItems) {
      for (const lineItem of data.adLineItems) {
        for (let i = 0; i < lineItem.quantity; i++) {
          await addPlacement(campaignId, {
            type: lineItem.type,
            publication: lineItem.publication ?? "The Peak",
            status: isEvergreen
              ? "Approved"
              : getDefaultPlacementStatus(
                  lineItem.type,
                  lineItem.publication ?? "The Peak"
                ),
            onboardingRoundId:
              isEvergreen
                ? undefined
                : firstRound &&
                    getOnboardingFormTypeForPlacement({
                      type: lineItem.type,
                      publication: lineItem.publication ?? "The Peak",
                    }) === firstRoundFormType
                  ? firstRound.id
                  : undefined,
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
    if (
      campaign.status === "Waiting for onboarding" ||
      campaign.status === "Onboarding to be sent"
    ) {
      await db
        .update(schema.campaigns)
        .set({ status: "Active" satisfies CampaignStatus })
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
    ioSigningContactName?: string;
    ioSigningContactEmail?: string;
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
        ioSigningContactName: data.ioSigningContactName ?? null,
        ioSigningContactEmail: data.ioSigningContactEmail ?? null,
        billingAddress: data.billingAddress ?? null,
        poNumber: data.poNumber ?? null,
        invoiceCadence: data.invoiceCadence ?? null,
        specialInstructions: data.specialInstructions ?? null,
      })
      .where(eq(schema.billingOnboarding.id, billing.id));

    return true;
  })();
}

export async function saveBillingOnboardingForm(
  campaignId: string,
  data: {
    primaryContactName?: string;
    primaryContactEmail?: string;
    representingClient?: boolean;
    wantsPeakCopy?: boolean;
    companyName?: string;
    billingAddress?: string;
    billingContactName?: string;
    billingContactEmail?: string;
    ioSigningContactName?: string;
    ioSigningContactEmail?: string;
    specificInvoicingInstructions?: string;
  }
): Promise<boolean> {
  const campaign = await db.query.campaigns.findFirst({
    where: eq(schema.campaigns.id, campaignId),
  });
  if (!campaign) return false;

  const billing = await db.query.billingOnboarding.findFirst({
    where: eq(schema.billingOnboarding.campaignId, campaignId),
  });
  if (!billing) return false;

  const extracted = extractBillingPortalMeta(campaign.notes);
  const notesWithMeta = attachBillingPortalMeta(extracted.cleanNotes, {
    ...extracted.meta,
    representingClient: data.representingClient,
    wantsPeakCopy: data.wantsPeakCopy,
  });

  await db
    .update(schema.campaigns)
    .set({
      contactName: data.primaryContactName ?? null,
      contactEmail: data.primaryContactEmail ?? null,
      notes: notesWithMeta || null,
    })
    .where(eq(schema.campaigns.id, campaignId));

  if (data.wantsPeakCopy !== undefined) {
    await db
      .update(schema.placements)
      .set({ copyProducer: data.wantsPeakCopy ? "Us" : "Client" })
      .where(eq(schema.placements.campaignId, campaignId));
  }

  await db
    .update(schema.billingOnboarding)
    .set({
      poNumber: data.companyName ?? null,
      billingAddress: data.billingAddress ?? null,
      billingContactName: data.billingContactName ?? null,
      billingContactEmail: data.billingContactEmail ?? null,
      ioSigningContactName: data.ioSigningContactName ?? null,
      ioSigningContactEmail: data.ioSigningContactEmail ?? null,
      specialInstructions: data.specificInvoicingInstructions ?? null,
    })
    .where(eq(schema.billingOnboarding.id, billing.id));

  return true;
}

export async function submitBillingOnboardingForm(
  campaignId: string,
  data: {
    primaryContactName: string;
    primaryContactEmail: string;
    representingClient: boolean;
    wantsPeakCopy: boolean;
    companyName: string;
    billingAddress: string;
    billingContactName: string;
    billingContactEmail: string;
    ioSigningContactName: string;
    ioSigningContactEmail: string;
    specificInvoicingInstructions?: string;
  }
): Promise<boolean> {
  const saved = await saveBillingOnboardingForm(campaignId, data);
  if (!saved) return false;

  const billing = await db.query.billingOnboarding.findFirst({
    where: eq(schema.billingOnboarding.campaignId, campaignId),
  });
  if (!billing) return false;

  await db
    .update(schema.billingOnboarding)
    .set({
      complete: true,
      completedAt: new Date(),
    })
    .where(eq(schema.billingOnboarding.id, billing.id));

  return true;
}

export async function updateBillingOnboardingByAdmin(
  campaignId: string,
  data: {
    poNumber?: string;
    representingClient?: boolean;
    wantsPeakCopy?: boolean;
    billingAddress?: string;
    billingContactName?: string;
    billingContactEmail?: string;
    ioSigningContactName?: string;
    ioSigningContactEmail?: string;
    invoiceCadence?: InvoiceCadence;
    specialInstructions?: string;
  }
): Promise<boolean> {
  const campaign = await db.query.campaigns.findFirst({
    where: eq(schema.campaigns.id, campaignId),
  });
  if (!campaign) return false;

  const billing = await db.query.billingOnboarding.findFirst({
    where: eq(schema.billingOnboarding.campaignId, campaignId),
  });
  if (!billing) return false;

  const normalize = (value?: string) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  };

  const extracted = extractBillingPortalMeta(campaign.notes);
  const notesWithMeta = attachBillingPortalMeta(extracted.cleanNotes, {
    ...extracted.meta,
    representingClient: data.representingClient,
    wantsPeakCopy: data.wantsPeakCopy,
  });

  await db
    .update(schema.campaigns)
    .set({
      notes: notesWithMeta || null,
    })
    .where(eq(schema.campaigns.id, campaignId));

  if (data.wantsPeakCopy !== undefined) {
    await db
      .update(schema.placements)
      .set({ copyProducer: data.wantsPeakCopy ? "Us" : "Client" })
      .where(eq(schema.placements.campaignId, campaignId));
  }

  await db
    .update(schema.billingOnboarding)
    .set({
      poNumber: normalize(data.poNumber),
      billingAddress: normalize(data.billingAddress),
      billingContactName: normalize(data.billingContactName),
      billingContactEmail: normalize(data.billingContactEmail),
      ioSigningContactName: normalize(data.ioSigningContactName),
      ioSigningContactEmail: normalize(data.ioSigningContactEmail),
      invoiceCadence: data.invoiceCadence ?? null,
      specialInstructions: normalize(data.specialInstructions),
    })
    .where(eq(schema.billingOnboarding.id, billing.id));

  return true;
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
    scheduledEndDate?: string;
    historicalDateOverride?: boolean;
    interviewScheduled?: boolean;
    committedImpressions?: number;
    copyProducer?: "Us" | "Client";
    status: PlacementStatus;
    notes?: string;
    onboardingRoundId?: string;
  }
): Promise<Placement | null> {
  return (async () => {
    if (!isValidPlacementPublication(data.type, data.publication)) {
      throw new Error(
        `Invalid type/publication combination: ${data.type} + ${data.publication}`
      );
    }

    const campaign = await db.query.campaigns.findFirst({
      where: eq(schema.campaigns.id, campaignId),
    });
    if (!campaign) return null;
    const billingMeta = extractBillingPortalMeta(campaign.notes).meta;
    const resolvedCopyProducer =
      data.copyProducer ??
      (billingMeta.wantsPeakCopy === false
        ? "Client"
        : billingMeta.wantsPeakCopy === true
          ? "Us"
          : undefined);

    if (campaign.category !== "Evergreen" && data.onboardingRoundId) {
      const round = await db.query.onboardingRounds.findFirst({
        where: and(
          eq(schema.onboardingRounds.id, data.onboardingRoundId),
          eq(schema.onboardingRounds.campaignId, campaignId)
        ),
      });
      if (!round) {
        throw new Error("Selected onboarding round was not found");
      }
      const placementFormType = getOnboardingFormTypeForPlacement({
        type: data.type,
        publication: data.publication,
      });
      const roundFormType = (round.formType as OnboardingFormType) ?? "newsletter";
      if (placementFormType !== roundFormType) {
        throw new Error(
          `Cannot assign ${data.type} (${data.publication}) to a ${roundFormType} onboarding form`
        );
      }
    }

    const id = genId("placement");
    const now = new Date();
    const nextStatus: PlacementStatus =
      campaign.category === "Evergreen" ? "Approved" : data.status;
    const notesWithMeta = attachPlacementMeta(data.notes ?? null, {
      scheduledEndDate: data.scheduledEndDate,
      interviewScheduled: data.interviewScheduled,
      committedImpressions: data.committedImpressions,
    });

    if (data.scheduledDate) {
      await assertPlacementDateAllowed(
        data.scheduledDate,
        data.type,
        data.publication,
        undefined,
        { allowHistoricalDateOverride: data.historicalDateOverride === true }
      );
    }

    await db.insert(schema.placements).values({
      id,
      campaignId,
      name: `${campaign.name} — ${data.type}`,
      type: data.type,
      publication: data.publication,
      scheduledDate: data.scheduledDate ?? null,
      status: nextStatus,
      onboardingRoundId:
        campaign.category === "Evergreen" ? null : data.onboardingRoundId ?? null,
      copyProducer: resolvedCopyProducer ?? null,
      notes: notesWithMeta || null,
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
      scheduledEndDate: data.scheduledEndDate,
      interviewScheduled: data.interviewScheduled,
      committedImpressions: data.committedImpressions,
      status: nextStatus,
      onboardingRoundId:
        campaign.category === "Evergreen" ? undefined : data.onboardingRoundId,
      copyProducer: resolvedCopyProducer,
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
    })
    .where(eq(schema.placements.id, placementId));

  return { beehiivPostId };
}

export async function updatePlacementOnboardingRound(
  campaignId: string,
  placementId: string,
  onboardingRoundId: string | null
): Promise<boolean> {
  const placement = await getPlacement(campaignId, placementId);
  if (!placement) return false;

  if (onboardingRoundId) {
    const round = await db.query.onboardingRounds.findFirst({
      where: and(
        eq(schema.onboardingRounds.id, onboardingRoundId),
        eq(schema.onboardingRounds.campaignId, campaignId)
      ),
    });
    if (!round) return false;

    const roundFormType = (round.formType as OnboardingFormType) ?? "newsletter";
    const placementFormType = getOnboardingFormTypeForPlacement(placement);
    if (roundFormType !== placementFormType) {
      throw new Error(
        `Cannot assign ${placement.type} (${placement.publication}) to a ${roundFormType} onboarding form`
      );
    }
  }

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
    category?: CampaignCategory;
    status?: CampaignStatus;
    clientName?: string | null;
    salesPerson?: string | null;
    campaignManager?: CampaignManager;
    currency?: CampaignCurrency;
    taxEligible?: boolean;
    legacyOnboardingDocUrl?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    contacts?: CampaignContact[] | null;
    notes?: string | null;
    campaignManagerNotes?: string | null;
    specialInvoicingInstructions?: string | null;
    longTermClient?: boolean;
    complementaryCampaign?: boolean;
  }
): Promise<boolean> {
  const campaign = await db.query.campaigns.findFirst({
    where: eq(schema.campaigns.id, campaignId),
  });
  if (!campaign) return false;

  const managerNotesExtracted = extractCampaignManagerNotes(campaign.notes);
  const extracted = extractBillingPortalMeta(
    managerNotesExtracted.notesWithoutManagerNotes
  );
  const nextMeta: BillingPortalMeta = {
    ...extracted.meta,
    salesPerson:
      data.salesPerson !== undefined
        ? data.salesPerson ?? undefined
        : extracted.meta.salesPerson,
    contacts:
      data.contacts !== undefined
        ? (data.contacts ?? [])
            .map((c) => ({
              name: c.name?.trim() ?? "",
              email: c.email?.trim() ?? "",
            }))
            .filter((c) => c.name && c.email)
        : extracted.meta.contacts,
    longTermClient:
      data.longTermClient !== undefined
        ? data.longTermClient
        : extracted.meta.longTermClient,
    complementaryCampaign:
      data.complementaryCampaign !== undefined
        ? data.complementaryCampaign
        : extracted.meta.complementaryCampaign,
  };

  const nextNotes =
    data.notes !== undefined
      ? extractBillingPortalMeta(data.notes).cleanNotes
      : extracted.cleanNotes;
  const nextManagerNotes =
    data.campaignManagerNotes !== undefined
      ? data.campaignManagerNotes?.trim() || null
      : managerNotesExtracted.managerNotes ?? null;

  const updatePayload: Record<string, unknown> = {
    notes:
      attachCampaignManagerNotes(
        attachBillingPortalMeta(nextNotes ?? null, nextMeta) || null,
        nextManagerNotes
      ) || null,
  };

  if (data.name !== undefined) updatePayload.name = data.name;
  if (data.category !== undefined) updatePayload.category = data.category;
  if (data.status !== undefined) updatePayload.status = data.status;
  if (data.campaignManager !== undefined) {
    if (!isCampaignManager(data.campaignManager)) {
      throw new Error(
        `campaignManager must be one of: ${CAMPAIGN_MANAGERS.join(", ")}`
      );
    }
    updatePayload.campaignManager = data.campaignManager;
  }
  if (data.currency !== undefined) {
    updatePayload.currency = data.currency;
  }
  if (data.taxEligible !== undefined) {
    updatePayload.taxEligible = data.taxEligible;
  }
  if (data.legacyOnboardingDocUrl !== undefined) {
    const normalized = data.legacyOnboardingDocUrl?.trim() ?? null;
    updatePayload.legacyOnboardingDocUrl = normalized || null;
  }
  if (data.contactName !== undefined) {
    updatePayload.contactName = data.contactName;
  }
  if (data.contactEmail !== undefined) {
    updatePayload.contactEmail = data.contactEmail;
  }
  if (data.contacts !== undefined) {
    const firstContact = nextMeta.contacts?.[0];
    updatePayload.contactName = firstContact?.name ?? null;
    updatePayload.contactEmail = firstContact?.email ?? null;
  }

  if (data.clientName !== undefined) {
    const nextClientName = data.clientName?.trim() ?? "";
    if (nextClientName.length > 0) {
      const nextClient = await findOrCreateClient(nextClientName);
      updatePayload.clientId = nextClient.id;
    }
  }

  const result = await db
    .update(schema.campaigns)
    .set(updatePayload)
    .where(eq(schema.campaigns.id, campaignId));
  const didUpdateCampaign = (result.rowCount ?? 0) > 0;
  if (!didUpdateCampaign) return false;

  if (data.specialInvoicingInstructions !== undefined) {
    const normalized = data.specialInvoicingInstructions?.trim() || null;
    await db
      .update(schema.billingOnboarding)
      .set({ specialInstructions: normalized })
      .where(eq(schema.billingOnboarding.campaignId, campaignId));
  }

  return true;
}

export async function updateCampaignPandaDoc(
  campaignId: string,
  data: {
    documentId: string;
    status?: string | null;
    documentUrl?: string | null;
    createdAt?: Date;
  }
): Promise<boolean> {
  const result = await db
    .update(schema.campaigns)
    .set({
      pandadocDocumentId: data.documentId,
      pandadocStatus: data.status ?? null,
      pandadocDocumentUrl: data.documentUrl ?? null,
      pandadocCreatedAt: data.createdAt ?? new Date(),
    })
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
    scheduledEndDate?: string | null;
    historicalDateOverride?: boolean;
    interviewScheduled?: boolean | null;
    committedImpressions?: number | null;
    status?: PlacementStatus;
    copyProducer?: "Us" | "Client" | null;
    notes?: string | null;
    linkToPlacement?: string | null;
    conflictPreference?: "Defer if conflict" | "Date is crucial" | null;
    imageUrl?: string | null;
    logoUrl?: string | null;
  }
): Promise<boolean> {
  const placementRow = await db.query.placements.findFirst({
    where: and(
      eq(schema.placements.id, placementId),
      eq(schema.placements.campaignId, campaignId)
    ),
  });
  if (!placementRow) return false;
  const campaignRow = await db.query.campaigns.findFirst({
    where: eq(schema.campaigns.id, campaignId),
  });
  const isEvergreen = campaignRow?.category === "Evergreen";

  const nextType = data.type ?? (placementRow.type as PlacementType);
  const nextPublication =
    data.publication ?? (placementRow.publication as Publication);
  if (!isValidPlacementPublication(nextType, nextPublication)) {
    throw new Error(
      `Invalid type/publication combination: ${nextType} + ${nextPublication}`
    );
  }

  const nextScheduledDate =
    data.scheduledDate !== undefined
      ? data.scheduledDate
      : placementRow.scheduledDate;
  const allowHistoricalDateOverride =
    data.historicalDateOverride === true ||
    (nextScheduledDate != null &&
      nextScheduledDate === placementRow.scheduledDate &&
      isPastDateKey(nextScheduledDate, getTodayDateKey()));
  if (nextScheduledDate) {
    await assertPlacementDateAllowed(
      nextScheduledDate,
      nextType,
      nextPublication,
      placementId,
      { allowHistoricalDateOverride }
    );
  }

  const extracted = extractPlacementMeta(placementRow.notes);
  const nextMeta = {
    scheduledEndDate:
      data.scheduledEndDate !== undefined
        ? data.scheduledEndDate ?? undefined
        : extracted.meta.scheduledEndDate,
    interviewScheduled:
      data.interviewScheduled !== undefined
        ? data.interviewScheduled ?? undefined
        : extracted.meta.interviewScheduled,
    committedImpressions:
      data.committedImpressions !== undefined
        ? data.committedImpressions ?? undefined
        : extracted.meta.committedImpressions,
  };
  const nextCleanNotes =
    data.notes !== undefined ? data.notes : extracted.cleanNotes;

  const updatePayload: Record<string, unknown> = {
    notes: attachPlacementMeta(nextCleanNotes ?? null, nextMeta) || null,
  };
  if (data.name !== undefined) updatePayload.name = data.name;
  if (data.type !== undefined) updatePayload.type = data.type;
  if (data.publication !== undefined) updatePayload.publication = data.publication;
  if (data.scheduledDate !== undefined) updatePayload.scheduledDate = data.scheduledDate;
  if (isEvergreen) {
    updatePayload.status = "Approved";
  } else if (data.status !== undefined) {
    updatePayload.status = data.status;
  }
  if (data.copyProducer !== undefined) updatePayload.copyProducer = data.copyProducer;
  if (data.linkToPlacement !== undefined) updatePayload.linkToPlacement = data.linkToPlacement;
  if (data.conflictPreference !== undefined) {
    updatePayload.conflictPreference = data.conflictPreference;
  }
  if (data.imageUrl !== undefined) updatePayload.imageUrl = data.imageUrl;
  if (data.logoUrl !== undefined) updatePayload.logoUrl = data.logoUrl;

  const result = await db
    .update(schema.placements)
    .set(updatePayload)
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

    // Get the placement to check its type and publication
    const placement = await getPlacement(campaignId, placementId);
    if (!placement) {
      errors.push({ placementId, error: "Placement not found" });
      continue;
    }

    try {
      await assertPlacementDateAllowed(
        scheduledDate,
        placement.type,
        placement.publication,
        placementId
      );
    } catch (error) {
      errors.push({
        placementId,
        error: error instanceof Error ? error.message : "Date is unavailable",
      });
      continue;
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

export async function deletePlacement(
  campaignId: string,
  placementId: string
): Promise<boolean> {
  const result = await db
    .delete(schema.placements)
    .where(
      and(
        eq(schema.placements.id, placementId),
        eq(schema.placements.campaignId, campaignId)
      )
    );
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
    campaignObjective?: string;
    keyMessage?: string;
    talkingPoints?: string;
    callToAction?: string;
    targetAudience?: string;
    toneGuidelines?: string;
    placementBriefs?: {
      placementId: string;
      brief: string;
      copy?: string;
      link?: string;
      scheduledDate?: string;
      imageUrl?: string;
      logoUrl?: string;
    }[];
  }
): Promise<boolean> {
  // Save campaign-level fields
  await db
    .update(schema.campaigns)
    .set({
      onboardingCampaignObjective: data.campaignObjective ?? null,
      onboardingKeyMessage: data.keyMessage ?? null,
      onboardingTalkingPoints: data.talkingPoints ?? null,
      onboardingCallToAction: data.callToAction ?? null,
      onboardingTargetAudience: data.targetAudience ?? null,
      onboardingToneGuidelines: data.toneGuidelines ?? null,
    })
    .where(eq(schema.campaigns.id, campaignId));

  // Save per-placement briefs, links, and onboarding-selected dates
  if (data.placementBriefs) {
    for (const {
      placementId,
      brief,
      copy,
      link,
      scheduledDate,
      imageUrl,
      logoUrl,
    } of data.placementBriefs) {
      let canSetDate = false;
      const updates: Record<string, string | null> = {
        onboardingBrief: brief || null,
      };
      if (link !== undefined) {
        updates.linkToPlacement = link || null;
      }
      if (imageUrl !== undefined) {
        updates.imageUrl = imageUrl || null;
      }
      if (logoUrl !== undefined) {
        updates.logoUrl = logoUrl || null;
      }

      if (scheduledDate !== undefined) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
          throw new Error(`Invalid date format for placement ${placementId}`);
        }

        const placement = await getPlacement(campaignId, placementId);
        if (!placement) {
          throw new Error(`Placement not found: ${placementId}`);
        }

        if (placement.scheduledDate && placement.scheduledDate !== scheduledDate) {
          throw new Error(
            `Placement ${placement.type} already has a scheduled date (${placement.scheduledDate})`
          );
        }

        canSetDate = !placement.scheduledDate;

        if (canSetDate) {
          await assertPlacementDateAllowed(
            scheduledDate,
            placement.type,
            placement.publication
          );
        }

        if (canSetDate) {
          updates.scheduledDate = scheduledDate;
        }
      }

      const placementWhere = canSetDate
        ? and(
            eq(schema.placements.id, placementId),
            eq(schema.placements.campaignId, campaignId),
            isNull(schema.placements.scheduledDate)
          )
        : and(
            eq(schema.placements.id, placementId),
            eq(schema.placements.campaignId, campaignId)
          );

      await db
        .update(schema.placements)
        .set(updates)
        .where(placementWhere);

      if (copy !== undefined) {
        await db
          .update(schema.placements)
          .set({ currentCopy: copy })
          .where(
            and(
              eq(schema.placements.id, placementId),
              eq(schema.placements.campaignId, campaignId)
            )
          );
      }

      if (scheduledDate !== undefined) {
        const latest = await getPlacement(campaignId, placementId);
        if (!latest || latest.scheduledDate !== scheduledDate) {
          throw new Error(
            `Failed to set placement date for ${placementId}; it may have been scheduled already`
          );
        }
      }
    }
  }

  return true;
}

export async function submitOnboardingForm(
  campaignId: string,
  roundId: string,
  data: {
    campaignObjective: string;
    keyMessage: string;
    talkingPoints: string;
    callToAction: string;
    targetAudience: string;
    toneGuidelines: string;
    placementIds?: string[];
    placementBriefs?: {
      placementId: string;
      brief: string;
      copy?: string;
      link?: string;
      scheduledDate?: string;
      imageUrl?: string;
      logoUrl?: string;
    }[];
  }
): Promise<boolean> {
  await saveOnboardingForm(campaignId, data);

  const campaignRecord = await db.query.campaigns.findFirst({
    where: eq(schema.campaigns.id, campaignId),
  });
  const billingMeta = extractBillingPortalMeta(campaignRecord?.notes).meta;
  const clientProvidesCopy = billingMeta.wantsPeakCopy === false;

  // Assign any unassigned placements to this round
  const placementIds =
    data.placementIds && data.placementIds.length > 0
      ? data.placementIds
      : (data.placementBriefs ?? []).map((p) => p.placementId);

  for (const placementId of placementIds) {
    const placement = await getPlacement(campaignId, placementId);
    const nextStatus =
      clientProvidesCopy && placement
        ? isPodcastPublication(placement.publication)
          ? isPodcastInterviewType(placement.type)
            ? "Approved Interview"
            : "Approved Script"
          : "Approved"
        : placement && isPodcastPublication(placement.publication)
          ? isPodcastInterviewType(placement.type)
            ? "Drafting Questions"
            : "Drafting Script"
          : "Copywriting in Progress";
    await db
      .update(schema.placements)
      .set({
        onboardingRoundId: roundId,
        status: nextStatus,
      })
      .where(
        and(
          eq(schema.placements.id, placementId),
          eq(schema.placements.campaignId, campaignId)
        )
      );
  }

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
    if (
      campaign.status === "Waiting for onboarding" ||
      campaign.status === "Onboarding to be sent"
    ) {
      updates.status = "Active" satisfies CampaignStatus;
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

export async function updateCampaignInvoiceDashboardStatus(
  invoiceLinkId: string,
  dashboardStatus: DashboardInvoiceStatus
): Promise<boolean> {
  const result = await db
    .update(schema.campaignInvoices)
    .set({ dashboardStatus })
    .where(eq(schema.campaignInvoices.id, invoiceLinkId));

  return (result.rowCount ?? 0) > 0;
}

export async function updateCampaignInvoiceNotes(
  invoiceLinkId: string,
  notes: string | null
): Promise<boolean> {
  const result = await db
    .update(schema.campaignInvoices)
    .set({ notes })
    .where(eq(schema.campaignInvoices.id, invoiceLinkId));

  return (result.rowCount ?? 0) > 0;
}

export async function addCampaignManagerNote(
  campaignId: string,
  body: string,
  authorName?: CampaignManager
): Promise<boolean> {
  const campaign = await db.query.campaigns.findFirst({
    where: eq(schema.campaigns.id, campaignId),
  });
  if (!campaign) return false;

  const normalizedBody = body.trim();
  if (!normalizedBody) {
    throw new Error("Note body is required");
  }

  const normalizedAuthor = authorName ?? normalizeCampaignManager(campaign.campaignManager);

  await db.insert(schema.campaignManagerNotes).values({
    id: genId("cmn"),
    campaignId,
    authorName: normalizedAuthor,
    body: normalizedBody,
    createdAt: new Date(),
  });

  return true;
}

// ─── Internal helpers ────────────────────────────────────────

function normalizeCampaignManager(value: string | null | undefined): CampaignManager {
  return value && isCampaignManager(value) ? value : "Brett";
}

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
