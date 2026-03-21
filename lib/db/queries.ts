import { eq, and, gte, lte, isNotNull, sql } from "drizzle-orm";
import { db } from "./index";
import * as schema from "./schema";
import type {
  Client,
  Campaign,
  CampaignManager,
  CampaignManagerNote,
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
  CampaignCurrency,
  CampaignCategory,
  OnboardingFormType,
} from "../types";
import { DAILY_CAPACITY_LIMITS, isCampaignManager } from "../types";
import { isClientCopyPlacement } from "../types";
import type {
  CampaignInvoiceLink,
  PlacementInvoiceLink,
  DashboardInvoiceStatus,
  XeroInvoiceStatus,
} from "../xero-types";
import { getXeroConnection, fetchXeroInvoice } from "../xero";
import { extractPlacementMeta } from "../placement-meta";
import { extractCampaignManagerNotes } from "../campaign-manager-notes";

const BILLING_META_START = "<!-- billing-meta:start -->";
const BILLING_META_END = "<!-- billing-meta:end -->";
const CONTROL_PLANE_RETRY_DELAYS_MS = [150, 400];

interface CampaignPortalMeta {
  representingClient?: boolean;
  wantsPeakCopy?: boolean;
  salesPerson?: string;
  contacts?: CampaignContact[];
  longTermClient?: boolean;
  complementaryCampaign?: boolean;
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

function isControlPlaneRequestFailed(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const message = "message" in error ? String(error.message) : "";
  const cause =
    "cause" in error && typeof error.cause === "object" && error.cause !== null
      ? error.cause
      : null;
  const causeMessage = cause && "message" in cause ? String(cause.message) : "";
  const code = "code" in error ? String(error.code) : "";
  const causeCode =
    cause && "code" in cause ? String((cause as { code?: unknown }).code) : "";

  return (
    message.includes("Control plane request failed") ||
    causeMessage.includes("Control plane request failed") ||
    code === "XX000" ||
    causeCode === "XX000"
  );
}

async function withControlPlaneRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (
        !isControlPlaneRequestFailed(error) ||
        attempt >= CONTROL_PLANE_RETRY_DELAYS_MS.length
      ) {
        throw error;
      }
      const delay = CONTROL_PLANE_RETRY_DELAYS_MS[attempt];
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

function extractCampaignPortalMeta(notes?: string | null): {
  cleanNotes: string | undefined;
  meta: CampaignPortalMeta;
} {
  if (!notes) return { cleanNotes: undefined, meta: {} };

  const start = notes.lastIndexOf(BILLING_META_START);
  const end =
    start === -1 ? -1 : notes.indexOf(BILLING_META_END, start);
  if (start === -1 || end === -1 || end < start) {
    return { cleanNotes: notes, meta: {} };
  }

  const rawMeta = notes
    .slice(start + BILLING_META_START.length, end)
    .trim();

  let meta: CampaignPortalMeta = {};
  try {
    meta = JSON.parse(rawMeta) as CampaignPortalMeta;
  } catch {
    meta = {};
  }

  const cleanNotes =
    notes
      .replace(
        /<!-- billing-meta:start -->[\s\S]*?<!-- billing-meta:end -->/g,
        ""
      )
      .trim() || undefined;
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
    formType: (row.formType as OnboardingFormType) ?? "newsletter",
    formLink: row.formLink,
    complete: row.complete,
    onboardingDocUrl: row.onboardingDocUrl ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapBillingOnboarding(
  row: typeof schema.billingOnboarding.$inferSelect
): BillingOnboarding {
  return {
    formLink: row.formLink,
    complete: row.complete,
    completedAt: row.completedAt?.toISOString() ?? undefined,
    companyName: row.poNumber ?? undefined,
    billingContactName: row.billingContactName ?? undefined,
    billingContactEmail: row.billingContactEmail ?? undefined,
    ioSigningContactName: row.ioSigningContactName ?? undefined,
    ioSigningContactEmail: row.ioSigningContactEmail ?? undefined,
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
    committedImpressions: extracted.meta.committedImpressions,
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

function canClientViewCopy(placement: Placement): boolean {
  if (isClientCopyPlacement(placement)) {
    return true;
  }

  const status = placement.status;
  const statusAllowsCopy =
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
    status === "Approved Interview";

  // Keep approved-and-scheduled copy visible to clients even if status was moved later.
  const approvedAndScheduled =
    Boolean(placement.scheduledDate) &&
    Boolean(placement.linkToPlacement?.trim()) &&
    placement.currentCopy.trim().length > 0;

  return statusAllowsCopy || approvedAndScheduled;
}

function maskPlacementForClient(placement: Placement): Placement {
  if (canClientViewCopy(placement)) {
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
  campaignManagerNotes: (typeof schema.campaignManagerNotes.$inferSelect)[];
  campaignInvoices?: (typeof schema.campaignInvoices.$inferSelect)[];
};

function isMissingBillingIoColumnError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const message = "message" in error ? String(error.message) : "";
  const causeMessage =
    "cause" in error && typeof error.cause === "object" && error.cause !== null
      ? "message" in error.cause
        ? String(error.cause.message)
        : ""
      : "";
  return (
    message.includes("io_signing_contact_name") ||
    message.includes("io_signing_contact_email") ||
    causeMessage.includes("io_signing_contact_name") ||
    causeMessage.includes("io_signing_contact_email")
  );
}

function isMissingDashboardStatusColumnError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const message = "message" in error ? String(error.message) : "";
  const causeMessage =
    "cause" in error && typeof error.cause === "object" && error.cause !== null
      ? "message" in error.cause
        ? String(error.cause.message)
        : ""
      : "";
  return (
    message.includes("dashboard_status") ||
    causeMessage.includes("dashboard_status")
  );
}

function isMissingFormLinkColumnError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const message = "message" in error ? String(error.message) : "";
  const causeMessage =
    "cause" in error && typeof error.cause === "object" && error.cause !== null
      ? "message" in error.cause
        ? String(error.cause.message)
        : ""
      : "";
  return (
    message.includes("form_link") ||
    message.includes("fillout_link") ||
    causeMessage.includes("form_link") ||
    causeMessage.includes("fillout_link")
  );
}

function isMissingCampaignManagerNotesTableError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const message = "message" in error ? String(error.message) : "";
  const causeMessage =
    "cause" in error && typeof error.cause === "object" && error.cause !== null
      ? "message" in error.cause
        ? String(error.cause.message)
        : ""
      : "";
  return (
    message.includes("campaign_manager_notes") ||
    causeMessage.includes("campaign_manager_notes")
  );
}

function mapXeroToDashboardStatus(status?: XeroInvoiceStatus): DashboardInvoiceStatus {
  switch (status) {
    case "DRAFT":
    case "SUBMITTED":
      return "DRAFT";
    case "PAID":
      return "PAID";
    default:
      return "AWAITING_PAYMENT";
  }
}

function withMissingBillingOnboarding<
  T extends Omit<CampaignRelational, "billingOnboarding">
>(rows: T[]): CampaignRelational[] {
  return rows.map((row) => ({
    ...row,
    billingOnboarding: null,
    campaignManagerNotes:
      "campaignManagerNotes" in row
        ? (row as unknown as CampaignRelational).campaignManagerNotes
        : [],
  }));
}

function withMissingCampaignForms<
  T extends Omit<CampaignRelational, "onboardingRounds" | "billingOnboarding">
>(rows: T[]): CampaignRelational[] {
  return rows.map((row) => ({
    ...row,
    onboardingRounds: [],
    billingOnboarding: null,
    campaignManagerNotes: [],
  }));
}

function withMissingCampaignManagerNotes<
  T extends Omit<CampaignRelational, "campaignManagerNotes">
>(rows: T[]): CampaignRelational[] {
  return rows.map((row) => ({
    ...row,
    campaignManagerNotes: [],
  }));
}

function mapCampaignManagerNote(
  row: typeof schema.campaignManagerNotes.$inferSelect
): CampaignManagerNote {
  return {
    id: row.id,
    campaignId: row.campaignId,
    authorName: normalizeCampaignManager(row.authorName),
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapCampaign(row: CampaignRelational): Campaign {
  const managerNotesExtracted = extractCampaignManagerNotes(row.notes);
  const extracted = extractCampaignPortalMeta(
    managerNotesExtracted.notesWithoutManagerNotes
  );
  const campaignManagerNotes = row.campaignManagerNotes
    .map(mapCampaignManagerNote)
    .sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  const legacyLatestNote = managerNotesExtracted.managerNotes?.trim()
    ? {
        id: "legacy-campaign-notes",
        campaignId: row.id,
        authorName: normalizeCampaignManager(row.campaignManager),
        body: managerNotesExtracted.managerNotes.trim(),
        createdAt: row.createdAt.toISOString(),
      }
    : undefined;
  const allCampaignManagerNotes =
    campaignManagerNotes.length > 0
      ? campaignManagerNotes
      : legacyLatestNote
        ? [legacyLatestNote]
        : [];
  const latestCampaignManagerNote = allCampaignManagerNotes[0];
  const contacts =
    normalizeCampaignContacts(extracted.meta.contacts) ??
    (row.contactName && row.contactEmail
      ? [{ name: row.contactName, email: row.contactEmail }]
      : undefined);
  return {
    id: row.id,
    name: row.name,
    portalId: row.portalId,
    clientId: row.clientId,
    category: (row.category as CampaignCategory) ?? "Standard",
    status: normalizeCampaignStatus(row.status),
    longTermClient: extracted.meta.longTermClient ?? undefined,
    complementaryCampaign: extracted.meta.complementaryCampaign ?? undefined,
    salesPerson: extracted.meta.salesPerson ?? undefined,
    campaignManager: normalizeCampaignManager(row.campaignManager),
    currency: (row.currency as CampaignCurrency) ?? "CAD",
    taxEligible: row.taxEligible,
    contactName: row.contactName ?? undefined,
    contactEmail: row.contactEmail ?? undefined,
    contacts,
    adLineItems: (row.adLineItems as AdLineItem[]) ?? undefined,
    placementsDescription: row.placementsDescription ?? undefined,
    performanceTableUrl: row.performanceTableUrl ?? undefined,
    notes: extracted.cleanNotes ?? undefined,
    campaignManagerNotes: allCampaignManagerNotes,
    latestCampaignManagerNote,
    onboardingCampaignObjective: row.onboardingCampaignObjective ?? undefined,
    onboardingKeyMessage: row.onboardingKeyMessage ?? undefined,
    onboardingTalkingPoints: row.onboardingTalkingPoints ?? undefined,
    onboardingCallToAction: row.onboardingCallToAction ?? undefined,
    onboardingTargetAudience: row.onboardingTargetAudience ?? undefined,
    onboardingToneGuidelines: row.onboardingToneGuidelines ?? undefined,
    onboardingSubmittedAt: row.onboardingSubmittedAt?.toISOString() ?? undefined,
    legacyOnboardingDocUrl: row.legacyOnboardingDocUrl ?? undefined,
    pandadocDocumentId: row.pandadocDocumentId ?? undefined,
    pandadocStatus: row.pandadocStatus ?? undefined,
    pandadocDocumentUrl: row.pandadocDocumentUrl ?? undefined,
    pandadocCreatedAt: row.pandadocCreatedAt?.toISOString() ?? undefined,
    onboardingRounds: row.onboardingRounds
      .map(mapOnboardingRound)
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ),
    billingOnboarding: row.billingOnboarding
      ? {
          ...mapBillingOnboarding(row.billingOnboarding),
          primaryContactName: row.contactName ?? undefined,
          primaryContactEmail: row.contactEmail ?? undefined,
          representingClient: extracted.meta.representingClient,
          wantsPeakCopy: extracted.meta.wantsPeakCopy,
        }
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

function normalizeCampaignStatus(status: string): CampaignStatus {
  if (status === "Waiting on Onboarding") return "Onboarding to be sent";
  if (status === "Onboarding Form Complete") return "Active";
  return status as CampaignStatus;
}

function normalizeCampaignManager(
  campaignManager: string | null
): CampaignManager {
  return campaignManager && isCampaignManager(campaignManager)
    ? campaignManager
    : "Brett";
}

async function getCampaignIdsForClient(clientId: string): Promise<string[]> {
  const rows = await db
    .select({ id: schema.campaigns.id })
    .from(schema.campaigns)
    .where(eq(schema.campaigns.clientId, clientId));
  return rows.map((r) => r.id);
}

async function getCampaignByPortalId(
  portalId: string
): Promise<(typeof schema.campaigns.$inferSelect & { client: typeof schema.clients.$inferSelect }) | null> {
  const row = await withControlPlaneRetry(() =>
    db.query.campaigns.findFirst({
      where: eq(schema.campaigns.portalId, portalId),
      with: { client: true },
    })
  );
  return row ?? null;
}

async function getSettingRow(
  key: string
): Promise<typeof schema.appSettings.$inferSelect | undefined> {
  return withControlPlaneRetry(() =>
    db.query.appSettings.findFirst({
      where: eq(schema.appSettings.key, key),
    })
  );
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
  const campaignRow = await getCampaignByPortalId(portalId);
  if (campaignRow) {
    return {
      id: campaignRow.client.id,
      name: campaignRow.client.name,
      portalId: campaignRow.portalId,
      campaignIds: [campaignRow.id],
    };
  }

  const legacyClient = await db.query.clients.findFirst({
    where: eq(schema.clients.portalId, portalId),
  });
  if (!legacyClient) return null;

  const mostRecentCampaign = await db.query.campaigns.findFirst({
    where: eq(schema.campaigns.clientId, legacyClient.id),
    orderBy: (campaigns, { desc }) => [desc(campaigns.createdAt)],
  });
  if (!mostRecentCampaign) {
    return mapClient(legacyClient, []);
  }

  return {
    id: legacyClient.id,
    name: legacyClient.name,
    portalId: mostRecentCampaign.portalId,
    campaignIds: [mostRecentCampaign.id],
  };
}

export async function getCampaignById(
  campaignId: string
): Promise<Campaign | null> {
  let row: CampaignRelational | null = null;
  try {
    row = (await db.query.campaigns.findFirst({
      where: eq(schema.campaigns.id, campaignId),
      with: {
        placements: {
          with: { revisionHistory: true },
        },
        onboardingRounds: true,
        billingOnboarding: true,
        campaignManagerNotes: true,
      },
    })) as CampaignRelational | null;
  } catch (error) {
    if (isMissingCampaignManagerNotesTableError(error)) {
      try {
        const fallbackRow = await db.query.campaigns.findFirst({
          where: eq(schema.campaigns.id, campaignId),
          with: {
            placements: {
              with: { revisionHistory: true },
            },
            onboardingRounds: true,
            billingOnboarding: true,
          },
        });
        row = fallbackRow
          ? withMissingCampaignManagerNotes([
              fallbackRow as Omit<CampaignRelational, "campaignManagerNotes">,
            ])[0]
          : null;
      } catch (fallbackError) {
        if (isMissingBillingIoColumnError(fallbackError)) {
          try {
            const withoutBillingRow = await db.query.campaigns.findFirst({
              where: eq(schema.campaigns.id, campaignId),
              with: {
                placements: {
                  with: { revisionHistory: true },
                },
                onboardingRounds: true,
              },
            });
            row = withoutBillingRow
              ? withMissingCampaignManagerNotes(
                  withMissingBillingOnboarding([
                    withoutBillingRow as unknown as Omit<
                      CampaignRelational,
                      "billingOnboarding"
                    >,
                  ])
                )[0]
              : null;
          } catch (legacyError) {
            if (!isMissingFormLinkColumnError(legacyError)) throw legacyError;
            const legacyRow = await db.query.campaigns.findFirst({
              where: eq(schema.campaigns.id, campaignId),
              with: {
                placements: {
                  with: { revisionHistory: true },
                },
              },
            });
            row = legacyRow
              ? withMissingCampaignManagerNotes(
                  withMissingCampaignForms([
                    legacyRow as unknown as Omit<
                      CampaignRelational,
                      "onboardingRounds" | "billingOnboarding"
                    >,
                  ])
                )[0]
              : null;
          }
        } else if (isMissingFormLinkColumnError(fallbackError)) {
          const legacyRow = await db.query.campaigns.findFirst({
            where: eq(schema.campaigns.id, campaignId),
            with: {
              placements: {
                with: { revisionHistory: true },
              },
              billingOnboarding: true,
            },
          });
          row = legacyRow
            ? withMissingCampaignManagerNotes(
                withMissingCampaignForms([
                  legacyRow as unknown as Omit<
                    CampaignRelational,
                    "onboardingRounds" | "billingOnboarding"
                  >,
                ])
              )[0]
            : null;
        } else {
          throw fallbackError;
        }
      }
    } else if (isMissingBillingIoColumnError(error)) {
      try {
        const fallbackRow = await db.query.campaigns.findFirst({
          where: eq(schema.campaigns.id, campaignId),
          with: {
            placements: {
              with: { revisionHistory: true },
            },
            onboardingRounds: true,
            campaignManagerNotes: true,
          },
        });
        row = fallbackRow
          ? withMissingBillingOnboarding([
              fallbackRow as Omit<CampaignRelational, "billingOnboarding">,
            ])[0]
          : null;
      } catch (fallbackError) {
        if (!isMissingFormLinkColumnError(fallbackError)) throw fallbackError;
        const legacyRow = await db.query.campaigns.findFirst({
          where: eq(schema.campaigns.id, campaignId),
          with: {
            placements: {
              with: { revisionHistory: true },
            },
            campaignManagerNotes: true,
          },
        });
        row = legacyRow
          ? withMissingCampaignForms([
              legacyRow as Omit<
                CampaignRelational,
                "onboardingRounds" | "billingOnboarding"
              >,
            ])[0]
          : null;
      }
    } else if (isMissingFormLinkColumnError(error)) {
      const legacyRow = await db.query.campaigns.findFirst({
        where: eq(schema.campaigns.id, campaignId),
        with: {
          placements: {
            with: { revisionHistory: true },
          },
          campaignManagerNotes: true,
        },
      });
      row = legacyRow
        ? withMissingCampaignForms([
            legacyRow as Omit<
              CampaignRelational,
              "onboardingRounds" | "billingOnboarding"
            >,
          ])[0]
        : null;
    } else {
      throw error;
    }
  }
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

  if (client.campaignIds.length === 1) {
    const campaign = await getCampaignById(client.campaignIds[0]);
    if (!campaign) return null;
    return {
      client,
      campaigns: [
        {
          ...campaign,
          placements: campaign.placements.map(maskPlacementForClient),
        },
      ],
    };
  }

  let campaignRows: CampaignRelational[] = [];
  try {
    campaignRows = (await db.query.campaigns.findMany({
      where: eq(schema.campaigns.clientId, client.id),
      with: {
        placements: {
          with: { revisionHistory: true },
        },
        onboardingRounds: true,
        billingOnboarding: true,
        campaignManagerNotes: true,
      },
    })) as CampaignRelational[];
  } catch (error) {
    if (isMissingCampaignManagerNotesTableError(error)) {
      try {
        const fallbackRows = await db.query.campaigns.findMany({
          where: eq(schema.campaigns.clientId, client.id),
          with: {
            placements: {
              with: { revisionHistory: true },
            },
            onboardingRounds: true,
            billingOnboarding: true,
          },
        });
        campaignRows = withMissingCampaignManagerNotes(
          fallbackRows as Omit<CampaignRelational, "campaignManagerNotes">[]
        );
      } catch (fallbackError) {
        if (isMissingBillingIoColumnError(fallbackError)) {
          try {
            const withoutBillingRows = await db.query.campaigns.findMany({
              where: eq(schema.campaigns.clientId, client.id),
              with: {
                placements: {
                  with: { revisionHistory: true },
                },
                onboardingRounds: true,
              },
            });
            campaignRows = withMissingCampaignManagerNotes(
              withMissingBillingOnboarding(
                withoutBillingRows as unknown as Omit<
                  CampaignRelational,
                  "billingOnboarding"
                >[]
              )
            );
          } catch (legacyError) {
            if (!isMissingFormLinkColumnError(legacyError)) throw legacyError;
            const legacyRows = await db.query.campaigns.findMany({
              where: eq(schema.campaigns.clientId, client.id),
              with: {
                placements: {
                  with: { revisionHistory: true },
                },
              },
            });
            campaignRows = withMissingCampaignManagerNotes(
              withMissingCampaignForms(
                legacyRows as unknown as Omit<
                  CampaignRelational,
                  "onboardingRounds" | "billingOnboarding"
                >[]
              )
            );
          }
        } else if (isMissingFormLinkColumnError(fallbackError)) {
          const legacyRows = await db.query.campaigns.findMany({
            where: eq(schema.campaigns.clientId, client.id),
            with: {
              placements: {
                with: { revisionHistory: true },
              },
              billingOnboarding: true,
            },
          });
          campaignRows = withMissingCampaignManagerNotes(
            withMissingCampaignForms(
              legacyRows as unknown as Omit<
                CampaignRelational,
                "onboardingRounds" | "billingOnboarding"
              >[]
            )
          );
        } else {
          throw fallbackError;
        }
      }
    } else if (isMissingBillingIoColumnError(error)) {
      try {
        const fallbackRows = await db.query.campaigns.findMany({
          where: eq(schema.campaigns.clientId, client.id),
          with: {
            placements: {
              with: { revisionHistory: true },
            },
            onboardingRounds: true,
            campaignManagerNotes: true,
          },
        });
        campaignRows = withMissingBillingOnboarding(
          fallbackRows as Omit<CampaignRelational, "billingOnboarding">[]
        );
      } catch (fallbackError) {
        if (!isMissingFormLinkColumnError(fallbackError)) throw fallbackError;
        const legacyRows = await db.query.campaigns.findMany({
          where: eq(schema.campaigns.clientId, client.id),
          with: {
            placements: {
              with: { revisionHistory: true },
            },
            campaignManagerNotes: true,
          },
        });
        campaignRows = withMissingCampaignForms(
          legacyRows as Omit<
            CampaignRelational,
            "onboardingRounds" | "billingOnboarding"
          >[]
        );
      }
    } else if (isMissingFormLinkColumnError(error)) {
      const legacyRows = await db.query.campaigns.findMany({
        where: eq(schema.campaigns.clientId, client.id),
        with: {
          placements: {
            with: { revisionHistory: true },
          },
          campaignManagerNotes: true,
        },
      });
      campaignRows = withMissingCampaignForms(
        legacyRows as Omit<
          CampaignRelational,
          "onboardingRounds" | "billingOnboarding"
        >[]
      );
    } else {
      throw error;
    }
  }

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
  let campaignRows: (CampaignRelational & {
    client: typeof schema.clients.$inferSelect;
  })[] = [];
  try {
    campaignRows = (await db.query.campaigns.findMany({
      with: {
        client: true,
        placements: {
          with: { revisionHistory: true },
        },
        onboardingRounds: true,
        billingOnboarding: true,
        campaignManagerNotes: true,
      },
    })) as (CampaignRelational & {
      client: typeof schema.clients.$inferSelect;
    })[];
  } catch (error) {
    if (isMissingCampaignManagerNotesTableError(error)) {
      try {
        const fallbackRows = await db.query.campaigns.findMany({
          with: {
            client: true,
            placements: {
              with: { revisionHistory: true },
            },
            onboardingRounds: true,
            billingOnboarding: true,
          },
        });
        campaignRows = withMissingCampaignManagerNotes(
          fallbackRows as (Omit<CampaignRelational, "campaignManagerNotes"> & {
            client: typeof schema.clients.$inferSelect;
          })[]
        ) as (CampaignRelational & {
          client: typeof schema.clients.$inferSelect;
        })[];
      } catch (fallbackError) {
        if (isMissingBillingIoColumnError(fallbackError)) {
          try {
            const withoutBillingRows = await db.query.campaigns.findMany({
              with: {
                client: true,
                placements: {
                  with: { revisionHistory: true },
                },
                onboardingRounds: true,
              },
            });
            campaignRows = withMissingCampaignManagerNotes(
              withMissingBillingOnboarding(
                withoutBillingRows as unknown as (Omit<
                  CampaignRelational,
                  "billingOnboarding"
                > & {
                  client: typeof schema.clients.$inferSelect;
                })[]
              )
            ) as (CampaignRelational & {
              client: typeof schema.clients.$inferSelect;
            })[];
          } catch (legacyError) {
            if (!isMissingFormLinkColumnError(legacyError)) throw legacyError;
            const legacyRows = await db.query.campaigns.findMany({
              with: {
                client: true,
                placements: {
                  with: { revisionHistory: true },
                },
              },
            });
            campaignRows = withMissingCampaignManagerNotes(
              withMissingCampaignForms(
                legacyRows as unknown as (Omit<
                  CampaignRelational,
                  "onboardingRounds" | "billingOnboarding"
                > & {
                  client: typeof schema.clients.$inferSelect;
                })[]
              )
            ) as (CampaignRelational & {
              client: typeof schema.clients.$inferSelect;
            })[];
          }
        } else if (isMissingFormLinkColumnError(fallbackError)) {
          const legacyRows = await db.query.campaigns.findMany({
            with: {
              client: true,
              placements: {
                with: { revisionHistory: true },
              },
              billingOnboarding: true,
            },
          });
          campaignRows = withMissingCampaignManagerNotes(
            withMissingCampaignForms(
              legacyRows as unknown as (Omit<
                CampaignRelational,
                "onboardingRounds" | "billingOnboarding"
              > & {
                client: typeof schema.clients.$inferSelect;
              })[]
            )
          ) as (CampaignRelational & {
            client: typeof schema.clients.$inferSelect;
          })[];
        } else {
          throw fallbackError;
        }
      }
    } else if (isMissingBillingIoColumnError(error)) {
      try {
        const fallbackRows = await db.query.campaigns.findMany({
          with: {
            client: true,
            placements: {
              with: { revisionHistory: true },
            },
            onboardingRounds: true,
            campaignManagerNotes: true,
          },
        });
        campaignRows = withMissingBillingOnboarding(
          fallbackRows as (Omit<CampaignRelational, "billingOnboarding"> & {
            client: typeof schema.clients.$inferSelect;
          })[]
        ) as (CampaignRelational & {
          client: typeof schema.clients.$inferSelect;
        })[];
      } catch (fallbackError) {
        if (!isMissingFormLinkColumnError(fallbackError)) throw fallbackError;
        const legacyRows = await db.query.campaigns.findMany({
          with: {
            client: true,
            placements: {
              with: { revisionHistory: true },
            },
            campaignManagerNotes: true,
          },
        });
        campaignRows = withMissingCampaignForms(
          legacyRows as (Omit<
            CampaignRelational,
            "onboardingRounds" | "billingOnboarding"
          > & {
            client: typeof schema.clients.$inferSelect;
          })[]
        ) as (CampaignRelational & {
          client: typeof schema.clients.$inferSelect;
        })[];
      }
    } else if (isMissingFormLinkColumnError(error)) {
      const legacyRows = await db.query.campaigns.findMany({
        with: {
          client: true,
          placements: {
            with: { revisionHistory: true },
          },
          campaignManagerNotes: true,
        },
      });
      campaignRows = withMissingCampaignForms(
        legacyRows as (Omit<
          CampaignRelational,
          "onboardingRounds" | "billingOnboarding"
        > & {
          client: typeof schema.clients.$inferSelect;
        })[]
      ) as (CampaignRelational & {
        client: typeof schema.clients.$inferSelect;
      })[];
    } else {
      throw error;
    }
  }

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

  if (client.campaignIds.length === 1) {
    const campaign = await getCampaignById(client.campaignIds[0]);
    if (!campaign) return null;
    return {
      client,
      placements: campaign.placements.map((placement) => ({
        campaignId: campaign.id,
        campaignName: campaign.name,
        placement: maskPlacementForClient(placement),
      })),
    };
  }

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

    return {
      id: clientRow.id,
      name: clientRow.name,
      portalId: campaignRow.portalId,
      campaignIds: [campaignRow.id],
    };
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
  let rows: Array<{
    id: string;
    campaignId: string;
    xeroInvoiceId: string;
    dashboardStatus?: string;
    linkedAt: Date;
    notes: string | null;
  }> = [];
  let hasDashboardStatusColumn = true;

  try {
    rows = await db.query.campaignInvoices.findMany({
      where: eq(schema.campaignInvoices.campaignId, campaignId),
    });
  } catch (error) {
    if (!isMissingDashboardStatusColumnError(error)) throw error;
    hasDashboardStatusColumn = false;
    const legacy = await db.execute(sql`
      select id, campaign_id, xero_invoice_id, linked_at, notes
      from campaign_invoices
      where campaign_id = ${campaignId}
    `);
    rows = (legacy.rows as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      campaignId: String(row.campaign_id),
      xeroInvoiceId: String(row.xero_invoice_id),
      linkedAt: new Date(String(row.linked_at)),
      notes: (row.notes as string | null) ?? null,
    }));
  }

  const conn = await getXeroConnection();
  const links: CampaignInvoiceLink[] = [];

  for (const row of rows) {
    const link: CampaignInvoiceLink = {
      id: row.id,
      campaignId: row.campaignId,
      xeroInvoiceId: row.xeroInvoiceId,
      dashboardStatus: hasDashboardStatusColumn
        ? (row.dashboardStatus as DashboardInvoiceStatus)
        : "AWAITING_PAYMENT",
      linkedAt: row.linkedAt.toISOString(),
      notes: row.notes ?? undefined,
    };

    if (conn) {
      const invoice = await fetchXeroInvoice(
        conn.tenantId,
        conn.accessToken,
        row.xeroInvoiceId
      );
      if (invoice) {
        link.invoice = invoice;
        if (!hasDashboardStatusColumn) {
          link.dashboardStatus = mapXeroToDashboardStatus(invoice.status);
        }
      }
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
  campaignTaxEligible: boolean;
  campaignBillingSpecialInstructions?: string;
}

export async function getAllInvoiceLinks(): Promise<InvoiceLinkWithCampaign[]> {
  type RowWithCampaign = {
    id: string;
    campaignId: string;
    xeroInvoiceId: string;
    dashboardStatus?: string;
    linkedAt: Date;
    notes: string | null;
    campaign?: {
      name: string;
      taxEligible?: boolean;
      billingOnboarding?: {
        specialInstructions?: string | null;
      };
      client?: {
        name: string;
      };
    };
  };

  let rows: RowWithCampaign[] = [];
  let hasDashboardStatusColumn = true;

  try {
    rows = (await db.query.campaignInvoices.findMany({
      with: {
        campaign: {
          with: { client: true, billingOnboarding: true },
        },
      },
    })) as RowWithCampaign[];
  } catch (error) {
    if (!isMissingDashboardStatusColumnError(error)) throw error;
    hasDashboardStatusColumn = false;
    const legacy = await db.execute(sql`
      select
        ci.id,
        ci.campaign_id,
        ci.xero_invoice_id,
        ci.linked_at,
        ci.notes,
        c.name as campaign_name,
        cl.name as client_name,
        c.tax_eligible as campaign_tax_eligible,
        bo.special_instructions as campaign_billing_special_instructions
      from campaign_invoices ci
      left join campaigns c on c.id = ci.campaign_id
      left join clients cl on cl.id = c.client_id
      left join billing_onboarding bo on bo.campaign_id = c.id
    `);
    rows = (legacy.rows as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      campaignId: String(row.campaign_id),
      xeroInvoiceId: String(row.xero_invoice_id),
      linkedAt: new Date(String(row.linked_at)),
      notes: (row.notes as string | null) ?? null,
      campaign: {
        name: String(row.campaign_name ?? ""),
        taxEligible: Boolean(row.campaign_tax_eligible),
        billingOnboarding: {
          specialInstructions:
            (row.campaign_billing_special_instructions as string | null) ??
            null,
        },
        client: {
          name: String(row.client_name ?? ""),
        },
      },
    }));
  }

  const conn = await getXeroConnection();
  const links: InvoiceLinkWithCampaign[] = [];

  for (const r of rows) {
    const link: InvoiceLinkWithCampaign = {
      id: r.id,
      campaignId: r.campaignId,
      xeroInvoiceId: r.xeroInvoiceId,
      dashboardStatus: hasDashboardStatusColumn
        ? (r.dashboardStatus as DashboardInvoiceStatus)
        : "AWAITING_PAYMENT",
      linkedAt: r.linkedAt.toISOString(),
      notes: r.notes ?? undefined,
      campaignName: r.campaign?.name ?? "",
      clientName: r.campaign?.client?.name ?? "",
      campaignTaxEligible: r.campaign?.taxEligible ?? false,
      campaignBillingSpecialInstructions:
        r.campaign?.billingOnboarding?.specialInstructions ?? undefined,
    };

    if (conn) {
      const invoice = await fetchXeroInvoice(
        conn.tenantId,
        conn.accessToken,
        r.xeroInvoiceId
      );
      if (invoice) {
        link.invoice = invoice;
        if (!hasDashboardStatusColumn) {
          link.dashboardStatus = mapXeroToDashboardStatus(invoice.status);
        }
      }
    }

    links.push(link);
  }

  return links;
}

export async function getInvoiceLinkById(
  invoiceLinkId: string
): Promise<InvoiceLinkWithCampaign | null> {
  type Row = {
    id: string;
    campaignId: string;
    xeroInvoiceId: string;
    dashboardStatus?: string;
    linkedAt: Date;
    notes: string | null;
    campaign?: {
      name: string;
      taxEligible?: boolean;
      billingOnboarding?: {
        specialInstructions?: string | null;
      };
      client?: { name: string };
    };
  };

  let row: Row | null = null;
  let hasDashboardStatusColumn = true;

  try {
    row = (await db.query.campaignInvoices.findFirst({
      where: eq(schema.campaignInvoices.id, invoiceLinkId),
      with: {
        campaign: {
          with: { client: true, billingOnboarding: true },
        },
      },
    })) as Row | null;
  } catch (error) {
    if (!isMissingDashboardStatusColumnError(error)) throw error;
    hasDashboardStatusColumn = false;
    const legacy = await db.execute(sql`
      select
        ci.id,
        ci.campaign_id,
        ci.xero_invoice_id,
        ci.linked_at,
        ci.notes,
        c.name as campaign_name,
        cl.name as client_name,
        c.tax_eligible as campaign_tax_eligible,
        bo.special_instructions as campaign_billing_special_instructions
      from campaign_invoices ci
      left join campaigns c on c.id = ci.campaign_id
      left join clients cl on cl.id = c.client_id
      left join billing_onboarding bo on bo.campaign_id = c.id
      where ci.id = ${invoiceLinkId}
      limit 1
    `);
    const first = (legacy.rows as Array<Record<string, unknown>>)[0];
    if (first) {
      row = {
        id: String(first.id),
        campaignId: String(first.campaign_id),
        xeroInvoiceId: String(first.xero_invoice_id),
        linkedAt: new Date(String(first.linked_at)),
        notes: (first.notes as string | null) ?? null,
        campaign: {
          name: String(first.campaign_name ?? ""),
          taxEligible: Boolean(first.campaign_tax_eligible),
          billingOnboarding: {
            specialInstructions:
              (first.campaign_billing_special_instructions as string | null) ??
              null,
          },
          client: { name: String(first.client_name ?? "") },
        },
      };
    }
  }

  if (!row?.campaign?.client) return null;

  const link: InvoiceLinkWithCampaign = {
    id: row.id,
    campaignId: row.campaignId,
    xeroInvoiceId: row.xeroInvoiceId,
    dashboardStatus: hasDashboardStatusColumn
      ? (row.dashboardStatus as DashboardInvoiceStatus)
      : "AWAITING_PAYMENT",
    linkedAt: row.linkedAt.toISOString(),
    notes: row.notes ?? undefined,
    campaignName: row.campaign.name,
    clientName: row.campaign.client.name,
    campaignTaxEligible: row.campaign.taxEligible ?? false,
    campaignBillingSpecialInstructions:
      row.campaign.billingOnboarding?.specialInstructions ?? undefined,
  };

  const conn = await getXeroConnection();
  if (conn) {
    const invoice = await fetchXeroInvoice(
      conn.tenantId,
      conn.accessToken,
      row.xeroInvoiceId
    );
    if (invoice) {
      link.invoice = invoice;
      if (!hasDashboardStatusColumn) {
        link.dashboardStatus = mapXeroToDashboardStatus(invoice.status);
      }
    }
  }

  return link;
}

// ─── App settings queries ────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const row = await getSettingRow(key);
  return row?.value ?? null;
}

export interface ScheduledPlacementRow {
  campaignId: string;
  campaignName: string;
  clientName: string;
  placementId: string;
  placementName: string;
  placementType: PlacementType;
  publication: Publication;
  scheduledDate: string;
  status: PlacementStatus;
  currentCopy: string;
}

export async function getPlacementsScheduledOn(
  date: string
): Promise<ScheduledPlacementRow[]> {
  const rows = await db.query.placements.findMany({
    where: eq(schema.placements.scheduledDate, date),
    with: {
      campaign: {
        with: {
          client: true,
        },
      },
    },
  });

  return rows.map((row) => ({
    campaignId: row.campaignId,
    campaignName: row.campaign.name,
    clientName: row.campaign.client.name,
    placementId: row.id,
    placementName: row.name,
    placementType: row.type as PlacementType,
    publication: row.publication as Publication,
    scheduledDate: row.scheduledDate!,
    status: row.status as PlacementStatus,
    currentCopy: row.currentCopy,
  }));
}

// ─── Capacity / scheduling queries ──────────────────────────

function getWeekdaysInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const toDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const current = new Date(start + "T00:00:00");
  const last = new Date(end + "T00:00:00");
  while (current <= last) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      dates.push(toDateKey(current));
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
