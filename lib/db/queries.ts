import { eq, and, gte, lte, isNotNull } from "drizzle-orm";
import { db } from "./index";
import * as schema from "./schema";
import type {
  Client,
  Campaign,
  Placement,
  CopyVersion,
  OnboardingRound,
  BillingOnboarding,
  CampaignPageData,
  CampaignStatus,
  PlacementStatus,
  PlacementType,
  Publication,
  DashboardCampaign,
  ClientPlacementRow,
  AdLineItem,
  PerformanceStats,
  InvoiceCadence,
  SlotCapacity,
  DayCapacity,
  DateRangeCapacity,
  CampaignContact,
} from "../types";
import { DAILY_CAPACITY_LIMITS } from "../types";
import type { CampaignInvoiceLink, PlacementInvoiceLink } from "../xero-types";
import { getXeroConnection, fetchXeroInvoice } from "../xero";
import { extractPlacementMeta } from "../placement-meta";

const BILLING_META_START = "<!-- billing-meta:start -->";
const BILLING_META_END = "<!-- billing-meta:end -->";

interface CampaignPortalMeta {
  representingClient?: boolean;
  wantsPeakCopy?: boolean;
  salesPerson?: string;
  contacts?: CampaignContact[];
}

function normalizeCampaignContacts(
  contacts: CampaignContact[] | undefined
): CampaignContact[] | undefined {
  if (!contacts) return undefined;
  const normalized = contacts
    .map((c) => ({
      name: c.name?.trim() ?? "",
      email: c.email?.trim() ?? "",
    }))
    .filter((c) => c.name && c.email);
  return normalized.length > 0 ? normalized : undefined;
}

function extractCampaignPortalMeta(notes?: string | null): {
  cleanNotes: string | undefined;
  meta: CampaignPortalMeta;
} {
  if (!notes) return { cleanNotes: undefined, meta: {} };

  const start = notes.indexOf(BILLING_META_START);
  const end = notes.indexOf(BILLING_META_END);
  if (start === -1 || end === -1 || end < start) {
    return { cleanNotes: notes, meta: {} };
  }

  const before = notes.slice(0, start).trim();
  const after = notes.slice(end + BILLING_META_END.length).trim();
  const rawMeta = notes
    .slice(start + BILLING_META_START.length, end)
    .trim();

  let meta: CampaignPortalMeta = {};
  try {
    meta = JSON.parse(rawMeta) as CampaignPortalMeta;
  } catch {
    meta = {};
  }

  const cleanNotes = [before, after].filter(Boolean).join("\n\n").trim() || undefined;
  return { cleanNotes, meta };
}

// ─── Mapper helpers ──────────────────────────────────────────
// Convert DB rows (Date objects, nulls) to app types (ISO strings, undefineds)

function mapCopyVersion(row: typeof schema.copyVersions.$inferSelect): CopyVersion {
  return {
    version: row.version,
    copyText: row.copyText,
    createdAt: row.createdAt.toISOString(),
    revisionNotes: row.revisionNotes ?? undefined,
  };
}

function mapOnboardingRound(row: typeof schema.onboardingRounds.$inferSelect): OnboardingRound {
  return {
    id: row.id,
    label: row.label ?? undefined,
    filloutLink: row.filloutLink,
    complete: row.complete,
    onboardingDocUrl: row.onboardingDocUrl ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapBillingOnboarding(
  row: typeof schema.billingOnboarding.$inferSelect
): BillingOnboarding {
  return {
    filloutLink: row.filloutLink,
    complete: row.complete,
    completedAt: row.completedAt?.toISOString() ?? undefined,
    companyName: row.poNumber ?? undefined,
    billingContactName: row.billingContactName ?? undefined,
    billingContactEmail: row.billingContactEmail ?? undefined,
    billingAddress: row.billingAddress ?? undefined,
    poNumber: row.poNumber ?? undefined,
    invoiceCadence: (row.invoiceCadence as InvoiceCadence) ?? undefined,
    specialInstructions: row.specialInstructions ?? undefined,
    uploadedDocUrl: row.uploadedDocUrl ?? undefined,
  };
}

function mapPlacement(
  row: typeof schema.placements.$inferSelect,
  revisionHistory: CopyVersion[]
): Placement {
  const extracted = extractPlacementMeta(row.notes);
  return {
    id: row.id,
    name: row.name,
    type: row.type as PlacementType,
    publication: row.publication as Publication,
    scheduledDate: row.scheduledDate ?? undefined,
    scheduledEndDate: extracted.meta.scheduledEndDate,
    interviewScheduled: extracted.meta.interviewScheduled,
    status: row.status as PlacementStatus,
    currentCopy: row.currentCopy,
    copyVersion: row.copyVersion,
    revisionNotes: row.revisionNotes ?? undefined,
    revisionHistory,
    onboardingRoundId: row.onboardingRoundId ?? undefined,
    copyProducer: (row.copyProducer as "Us" | "Client") ?? undefined,
    notes: extracted.cleanNotes ?? undefined,
    onboardingBrief: row.onboardingBrief ?? undefined,
    stats: (row.stats as PerformanceStats) ?? undefined,
    imageUrl: row.imageUrl ?? undefined,
    logoUrl: row.logoUrl ?? undefined,
    linkToPlacement: row.linkToPlacement ?? undefined,
    conflictPreference:
      (row.conflictPreference as "Defer if conflict" | "Date is crucial") ??
      undefined,
    beehiivPostId: row.beehiivPostId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? undefined,
  };
}

function canClientViewCopy(status: PlacementStatus): boolean {
  return (
    status === "Peak Team Review Complete" ||
    status === "Sent for Approval" ||
    status === "Approved" ||
    status === "Script Review by Client" ||
    status === "Approved Script" ||
    status === "Audio Sent for Approval" ||
    status === "Audio Sent" ||
    status === "Audio Approved" ||
    status === "Questions In Review" ||
    status === "Client Reviewing Interview" ||
    status === "Revising for Client" ||
    status === "Approved Interview"
  );
}

function maskPlacementForClient(placement: Placement): Placement {
  if (canClientViewCopy(placement.status)) {
    return placement;
  }

  return {
    ...placement,
    currentCopy: "",
    copyVersion: 0,
    revisionHistory: [],
    revisionNotes: undefined,
  };
}

type CampaignRelational = typeof schema.campaigns.$inferSelect & {
  placements: (typeof schema.placements.$inferSelect & {
    revisionHistory: (typeof schema.copyVersions.$inferSelect)[];
  })[];
  onboardingRounds: (typeof schema.onboardingRounds.$inferSelect)[];
  billingOnboarding: typeof schema.billingOnboarding.$inferSelect | null;
  campaignInvoices?: (typeof schema.campaignInvoices.$inferSelect)[];
};

function mapCampaign(row: CampaignRelational): Campaign {
  const extracted = extractCampaignPortalMeta(row.notes);
  const contacts =
    normalizeCampaignContacts(extracted.meta.contacts) ??
    (row.contactName && row.contactEmail
      ? [{ name: row.contactName, email: row.contactEmail }]
      : undefined);
  return {
    id: row.id,
    name: row.name,
    clientId: row.clientId,
    status: row.status as CampaignStatus,
    salesPerson: extracted.meta.salesPerson ?? undefined,
    campaignManager: row.campaignManager ?? undefined,
    contactName: row.contactName ?? undefined,
    contactEmail: row.contactEmail ?? undefined,
    contacts,
    adLineItems: (row.adLineItems as AdLineItem[]) ?? undefined,
    placementsDescription: row.placementsDescription ?? undefined,
    performanceTableUrl: row.performanceTableUrl ?? undefined,
    notes: row.notes ?? undefined,
    onboardingMessaging: row.onboardingMessaging ?? undefined,
    onboardingDesiredAction: row.onboardingDesiredAction ?? undefined,
    onboardingSubmittedAt: row.onboardingSubmittedAt?.toISOString() ?? undefined,
    onboardingRounds: row.onboardingRounds
      .map(mapOnboardingRound)
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ),
    billingOnboarding: row.billingOnboarding
      ? mapBillingOnboarding(row.billingOnboarding)
      : undefined,
    placements: row.placements.map((p) =>
      mapPlacement(
        p,
        p.revisionHistory
          .map(mapCopyVersion)
          .sort((a, b) => a.version - b.version)
      )
    ),
    createdAt: row.createdAt.toISOString(),
  };
}

async function getCampaignIdsForClient(clientId: string): Promise<string[]> {
  const rows = await db
    .select({ id: schema.campaigns.id })
    .from(schema.campaigns)
    .where(eq(schema.campaigns.clientId, clientId));
  return rows.map((r) => r.id);
}

function mapClient(
  row: typeof schema.clients.$inferSelect,
  campaignIds: string[]
): Client {
  return {
    id: row.id,
    name: row.name,
    portalId: row.portalId,
    campaignIds,
  };
}

// ─── Query functions ─────────────────────────────────────────

export async function getClientByPortalId(
  portalId: string
): Promise<Client | null> {
  const row = await db.query.clients.findFirst({
    where: eq(schema.clients.portalId, portalId),
  });
  if (!row) return null;
  const campaignIds = await getCampaignIdsForClient(row.id);
  return mapClient(row, campaignIds);
}

export async function getCampaignById(
  campaignId: string
): Promise<Campaign | null> {
  const row = await db.query.campaigns.findFirst({
    where: eq(schema.campaigns.id, campaignId),
    with: {
      placements: {
        with: { revisionHistory: true },
      },
      onboardingRounds: true,
      billingOnboarding: true,
      campaignInvoices: true,
    },
  });
  if (!row) return null;
  return mapCampaign(row);
}

export function getPlacement(
  campaignId: string,
  placementId: string
): Promise<Placement | null> {
  return (async () => {
    const rows = await db.query.placements.findMany({
      where: eq(schema.placements.id, placementId),
      with: { revisionHistory: true },
    });
    const row = rows.find((r) => r.campaignId === campaignId);
    if (!row) return null;
    return mapPlacement(
      row,
      row.revisionHistory.map(mapCopyVersion).sort((a, b) => a.version - b.version)
    );
  })();
}

export async function getCampaignPageData(
  portalId: string,
  campaignId: string
): Promise<CampaignPageData | null> {
  const client = await getClientByPortalId(portalId);
  if (!client) return null;

  const campaign = await getCampaignById(campaignId);
  if (!campaign) return null;

  if (!client.campaignIds.includes(campaignId)) return null;

  return {
    client,
    campaign: {
      ...campaign,
      placements: campaign.placements.map(maskPlacementForClient),
    },
  };
}

export async function getCampaignsForClient(
  portalId: string
): Promise<{ client: Client; campaigns: Campaign[] } | null> {
  const client = await getClientByPortalId(portalId);
  if (!client) return null;

  const campaignRows = await db.query.campaigns.findMany({
    where: eq(schema.campaigns.clientId, client.id),
    with: {
      placements: {
        with: { revisionHistory: true },
      },
      onboardingRounds: true,
      billingOnboarding: true,
    },
  });

  return {
    client,
    campaigns: campaignRows.map((row) => {
      const campaign = mapCampaign(row);
      return {
        ...campaign,
        placements: campaign.placements.map(maskPlacementForClient),
      };
    }),
  };
}

export async function getAllCampaignsWithClients(): Promise<
  DashboardCampaign[]
> {
  const campaignRows = await db.query.campaigns.findMany({
    with: {
      client: true,
      placements: {
        with: { revisionHistory: true },
      },
      onboardingRounds: true,
      billingOnboarding: true,
    },
  });

  return campaignRows.map((row) => ({
    campaign: mapCampaign(row),
    clientName: row.client.name,
    clientPortalId: row.client.portalId,
  }));
}

export async function getPlacementsForClient(
  portalId: string
): Promise<{ client: Client; placements: ClientPlacementRow[] } | null> {
  const client = await getClientByPortalId(portalId);
  if (!client) return null;

  const campaignRows = await db.query.campaigns.findMany({
    where: eq(schema.campaigns.clientId, client.id),
    with: {
      placements: {
        with: { revisionHistory: true },
      },
    },
  });

  const placementsList: ClientPlacementRow[] = [];
  for (const c of campaignRows) {
    for (const p of c.placements) {
      placementsList.push({
        campaignId: c.id,
        campaignName: c.name,
        placement: maskPlacementForClient(
          mapPlacement(
            p,
            p.revisionHistory
              .map(mapCopyVersion)
              .sort((a, b) => a.version - b.version)
          )
        ),
      });
    }
  }

  return { client, placements: placementsList };
}

export async function getPlacementPageData(
  portalId: string,
  campaignId: string,
  placementId: string
): Promise<{ client: Client; campaign: Campaign; placement: Placement } | null> {
  const client = await getClientByPortalId(portalId);
  if (!client) return null;

  if (!client.campaignIds.includes(campaignId)) return null;

  const campaign = await getCampaignById(campaignId);
  if (!campaign) return null;

  const placement = campaign.placements.find((p) => p.id === placementId);
  if (!placement) return null;

  return {
    client,
    campaign: {
      ...campaign,
      placements: campaign.placements.map(maskPlacementForClient),
    },
    placement: maskPlacementForClient(placement),
  };
}

export function getClientByCampaignId(
  campaignId: string
): Promise<Client | null> {
  return (async () => {
    const campaignRow = await db.query.campaigns.findFirst({
      where: eq(schema.campaigns.id, campaignId),
    });
    if (!campaignRow) return null;

    const clientRow = await db.query.clients.findFirst({
      where: eq(schema.clients.id, campaignRow.clientId),
    });
    if (!clientRow) return null;

    const campaignIds = await getCampaignIdsForClient(clientRow.id);
    return mapClient(clientRow, campaignIds);
  })();
}

export async function getAllClients(): Promise<Client[]> {
  const rows = await db.query.clients.findMany();
  const results: Client[] = [];
  for (const row of rows) {
    const campaignIds = await getCampaignIdsForClient(row.id);
    results.push(mapClient(row, campaignIds));
  }
  return results;
}

// ─── Xero invoice queries ───────────────────────────────────

export async function getCampaignInvoiceLinks(
  campaignId: string
): Promise<CampaignInvoiceLink[]> {
  const rows = await db.query.campaignInvoices.findMany({
    where: eq(schema.campaignInvoices.campaignId, campaignId),
  });

  const conn = await getXeroConnection();
  const links: CampaignInvoiceLink[] = [];

  for (const row of rows) {
    const link: CampaignInvoiceLink = {
      id: row.id,
      campaignId: row.campaignId,
      xeroInvoiceId: row.xeroInvoiceId,
      linkedAt: row.linkedAt.toISOString(),
      notes: row.notes ?? undefined,
    };

    if (conn) {
      const invoice = await fetchXeroInvoice(
        conn.tenantId,
        conn.accessToken,
        row.xeroInvoiceId
      );
      if (invoice) link.invoice = invoice;
    }

    links.push(link);
  }

  return links;
}

export async function getPlacementInvoiceLinks(
  placementId: string
): Promise<PlacementInvoiceLink[]> {
  const rows = await db.query.placementInvoices.findMany({
    where: eq(schema.placementInvoices.placementId, placementId),
  });

  const conn = await getXeroConnection();
  const links: PlacementInvoiceLink[] = [];

  for (const row of rows) {
    const link: PlacementInvoiceLink = {
      id: row.id,
      placementId: row.placementId,
      xeroInvoiceId: row.xeroInvoiceId,
      linkedAt: row.linkedAt.toISOString(),
      notes: row.notes ?? undefined,
    };

    if (conn) {
      const invoice = await fetchXeroInvoice(
        conn.tenantId,
        conn.accessToken,
        row.xeroInvoiceId
      );
      if (invoice) link.invoice = invoice;
    }

    links.push(link);
  }

  return links;
}

export interface InvoiceLinkWithCampaign extends CampaignInvoiceLink {
  campaignName: string;
  clientName: string;
}

export async function getAllInvoiceLinks(): Promise<InvoiceLinkWithCampaign[]> {
  const rows = await db.query.campaignInvoices.findMany({
    with: {
      campaign: {
        with: { client: true },
      },
    },
  });

  type RowWithCampaign = (typeof rows)[number] & {
    campaign: typeof schema.campaigns.$inferSelect & {
      client: typeof schema.clients.$inferSelect;
    };
  };

  const conn = await getXeroConnection();
  const links: InvoiceLinkWithCampaign[] = [];

  for (const row of rows) {
    const r = row as RowWithCampaign;
    const link: InvoiceLinkWithCampaign = {
      id: r.id,
      campaignId: r.campaignId,
      xeroInvoiceId: r.xeroInvoiceId,
      linkedAt: r.linkedAt.toISOString(),
      notes: r.notes ?? undefined,
      campaignName: r.campaign?.name ?? "",
      clientName: r.campaign?.client?.name ?? "",
    };

    if (conn) {
      const invoice = await fetchXeroInvoice(
        conn.tenantId,
        conn.accessToken,
        row.xeroInvoiceId
      );
      if (invoice) link.invoice = invoice;
    }

    links.push(link);
  }

  return links;
}

// ─── App settings queries ────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const row = await db.query.appSettings.findFirst({
    where: eq(schema.appSettings.key, key),
  });
  return row?.value ?? null;
}

// ─── Capacity / scheduling queries ──────────────────────────

function getWeekdaysInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(start + "T00:00:00");
  const last = new Date(end + "T00:00:00");
  while (current <= last) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      dates.push(current.toISOString().slice(0, 10));
    }
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export async function getCapacityForDateRange(
  startDate: string,
  endDate: string
): Promise<DateRangeCapacity> {
  // Fetch all placements with a scheduledDate in the range
  const rows = await db
    .select({
      scheduledDate: schema.placements.scheduledDate,
      type: schema.placements.type,
      publication: schema.placements.publication,
    })
    .from(schema.placements)
    .where(
      and(
        isNotNull(schema.placements.scheduledDate),
        gte(schema.placements.scheduledDate, startDate),
        lte(schema.placements.scheduledDate, endDate)
      )
    );

  // Build usage map: date -> publication -> type -> count
  const usageMap = new Map<string, Map<string, Map<string, number>>>();
  for (const row of rows) {
    const date = row.scheduledDate!;
    if (!usageMap.has(date)) usageMap.set(date, new Map());
    const pubMap = usageMap.get(date)!;
    if (!pubMap.has(row.publication)) pubMap.set(row.publication, new Map());
    const typeMap = pubMap.get(row.publication)!;
    typeMap.set(row.type, (typeMap.get(row.type) ?? 0) + 1);
  }

  const publications: Publication[] = ["The Peak", "Peak Money", "Peak Daily Podcast"];
  const cappedTypes = (Object.entries(DAILY_CAPACITY_LIMITS) as [PlacementType, number | null][])
    .filter(([, limit]) => limit !== null) as [PlacementType, number][];

  const weekdays = getWeekdaysInRange(startDate, endDate);

  const days: DayCapacity[] = weekdays.map((date) => {
    const slots: SlotCapacity[] = [];
    for (const pub of publications) {
      for (const [type, limit] of cappedTypes) {
        const used = usageMap.get(date)?.get(pub)?.get(type) ?? 0;
        slots.push({
          publication: pub,
          type,
          used,
          limit,
          available: limit - used,
        });
      }
    }
    return { date, slots };
  });

  return { startDate, endDate, days };
}
