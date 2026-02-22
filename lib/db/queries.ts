import { eq } from "drizzle-orm";
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
} from "../types";
import type { CampaignInvoiceLink } from "../xero-types";
import { getXeroConnection, fetchXeroInvoice } from "../xero";

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
    billingContactName: row.billingContactName ?? undefined,
    billingContactEmail: row.billingContactEmail ?? undefined,
    billingAddress: row.billingAddress ?? undefined,
    poNumber: row.poNumber ?? undefined,
    invoiceCadence: (row.invoiceCadence as InvoiceCadence) ?? undefined,
    specialInstructions: row.specialInstructions ?? undefined,
  };
}

function mapPlacement(
  row: typeof schema.placements.$inferSelect,
  revisionHistory: CopyVersion[]
): Placement {
  return {
    id: row.id,
    name: row.name,
    type: row.type as PlacementType,
    publication: row.publication as Publication,
    scheduledDate: row.scheduledDate ?? undefined,
    status: row.status as PlacementStatus,
    currentCopy: row.currentCopy,
    copyVersion: row.copyVersion,
    revisionNotes: row.revisionNotes ?? undefined,
    revisionHistory,
    onboardingRoundId: row.onboardingRoundId ?? undefined,
    copyProducer: (row.copyProducer as "Us" | "Client") ?? undefined,
    notes: row.notes ?? undefined,
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

type CampaignRelational = typeof schema.campaigns.$inferSelect & {
  placements: (typeof schema.placements.$inferSelect & {
    revisionHistory: (typeof schema.copyVersions.$inferSelect)[];
  })[];
  onboardingRounds: (typeof schema.onboardingRounds.$inferSelect)[];
  billingOnboarding: typeof schema.billingOnboarding.$inferSelect | null;
  campaignInvoices?: (typeof schema.campaignInvoices.$inferSelect)[];
};

function mapCampaign(row: CampaignRelational): Campaign {
  return {
    id: row.id,
    name: row.name,
    clientId: row.clientId,
    status: row.status as CampaignStatus,
    campaignManager: row.campaignManager ?? undefined,
    contactName: row.contactName ?? undefined,
    contactEmail: row.contactEmail ?? undefined,
    adLineItems: (row.adLineItems as AdLineItem[]) ?? undefined,
    placementsDescription: row.placementsDescription ?? undefined,
    performanceTableUrl: row.performanceTableUrl ?? undefined,
    notes: row.notes ?? undefined,
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

  return { client, campaign };
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
    campaigns: campaignRows.map(mapCampaign),
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
        placement: mapPlacement(
          p,
          p.revisionHistory
            .map(mapCopyVersion)
            .sort((a, b) => a.version - b.version)
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

  return { client, campaign, placement };
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
