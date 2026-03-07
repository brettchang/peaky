import { sql } from "@vercel/postgres";
import type {
  AdLineItem,
  BillingOnboarding,
  Campaign,
  CampaignCategory,
  CampaignContact,
  CampaignCurrency,
  CampaignManager,
  CampaignStatus,
  DashboardCampaign,
  InvoiceCadence,
  OnboardingFormType,
  OnboardingRound,
  PerformanceStats,
  Placement,
  PlacementStatus,
  PlacementType,
  Publication,
} from "../lib/types";
import { isCampaignManager } from "../lib/types";

const BILLING_META_START = "<!-- billing-meta:start -->";
const BILLING_META_END = "<!-- billing-meta:end -->";

interface CampaignPortalMeta {
  representingClient?: boolean;
  wantsPeakCopy?: boolean;
  salesPerson?: string;
  contacts?: CampaignContact[];
  longTermClient?: boolean;
  complementaryCampaign?: boolean;
}

interface CampaignRow {
  id: string;
  name: string;
  client_id: string;
  status: string;
  campaign_manager: string | null;
  contact_name: string | null;
  contact_email: string | null;
  ad_line_items: unknown;
  placements_description: string | null;
  performance_table_url: string | null;
  notes: string | null;
  created_at: string | Date;
  portal_id: string | null;
  category: string | null;
  currency: string | null;
  tax_eligible: boolean | null;
  onboarding_campaign_objective: string | null;
  onboarding_key_message: string | null;
  onboarding_talking_points: string | null;
  onboarding_call_to_action: string | null;
  onboarding_target_audience: string | null;
  onboarding_tone_guidelines: string | null;
  onboarding_submitted_at: string | Date | null;
  legacy_onboarding_doc_url: string | null;
  pandadoc_document_id: string | null;
  pandadoc_status: string | null;
  pandadoc_document_url: string | null;
  pandadoc_created_at: string | Date | null;
  client_name: string | null;
  client_portal_id: string | null;
}

interface PlacementRow {
  id: string;
  campaign_id: string;
  name: string;
  type: string;
  publication: string;
  scheduled_date: string | null;
  status: string;
  current_copy: string;
  copy_version: number;
  revision_notes: string | null;
  onboarding_round_id: string | null;
  copy_producer: string | null;
  notes: string | null;
  onboarding_brief: string | null;
  stats: unknown;
  image_url: string | null;
  logo_url: string | null;
  link_to_placement: string | null;
  conflict_preference: string | null;
  beehiiv_post_id: string | null;
  created_at: string | Date;
  published_at: string | Date | null;
}

interface OnboardingRoundRow {
  id: string;
  campaign_id: string;
  label: string | null;
  form_type: string | null;
  form_link: string | null;
  complete: boolean | null;
  onboarding_doc_url: string | null;
  created_at: string | Date;
}

interface BillingOnboardingRow {
  campaign_id: string;
  form_link: string | null;
  complete: boolean | null;
  completed_at: string | Date | null;
  billing_contact_name: string | null;
  billing_contact_email: string | null;
  io_signing_contact_name: string | null;
  io_signing_contact_email: string | null;
  billing_address: string | null;
  po_number: string | null;
  invoice_cadence: unknown;
  special_instructions: string | null;
  uploaded_doc_url: string | null;
}

function extractCampaignPortalMeta(notes?: string | null): {
  cleanNotes: string | undefined;
  meta: CampaignPortalMeta;
} {
  if (!notes) return { cleanNotes: undefined, meta: {} };

  const start = notes.lastIndexOf(BILLING_META_START);
  const end = start === -1 ? -1 : notes.indexOf(BILLING_META_END, start);
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

function normalizeCampaignContacts(
  contacts: CampaignContact[] | undefined
): CampaignContact[] | undefined {
  if (!contacts) return undefined;
  const normalized = contacts
    .map((contact) => ({
      name: contact.name?.trim() ?? "",
      email: contact.email?.trim().toLowerCase() ?? "",
    }))
    .filter((contact) => contact.name && contact.email);
  return normalized.length > 0 ? normalized : undefined;
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

function toOptionalIsoString(value: string | Date | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function parseJsonValue<T>(value: unknown): T | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }
  return value as T;
}

function mapPlacement(row: PlacementRow): Placement {
  return {
    id: row.id,
    name: row.name,
    type: row.type as PlacementType,
    publication: row.publication as Publication,
    scheduledDate: row.scheduled_date ?? undefined,
    status: row.status as PlacementStatus,
    currentCopy: row.current_copy,
    copyVersion: Number(row.copy_version ?? 0),
    revisionNotes: row.revision_notes ?? undefined,
    revisionHistory: [],
    onboardingRoundId: row.onboarding_round_id ?? undefined,
    copyProducer:
      row.copy_producer === "Us" || row.copy_producer === "Client"
        ? row.copy_producer
        : undefined,
    notes: row.notes ?? undefined,
    onboardingBrief: row.onboarding_brief ?? undefined,
    stats: parseJsonValue<PerformanceStats>(row.stats),
    imageUrl: row.image_url ?? undefined,
    logoUrl: row.logo_url ?? undefined,
    linkToPlacement: row.link_to_placement ?? undefined,
    conflictPreference:
      row.conflict_preference === "Defer if conflict" ||
      row.conflict_preference === "Date is crucial"
        ? row.conflict_preference
        : undefined,
    beehiivPostId: row.beehiiv_post_id ?? undefined,
    createdAt: toOptionalIsoString(row.created_at) ?? new Date(0).toISOString(),
    publishedAt: toOptionalIsoString(row.published_at),
  };
}

function mapOnboardingRound(row: OnboardingRoundRow): OnboardingRound {
  return {
    id: row.id,
    label: row.label ?? undefined,
    formType: (row.form_type as OnboardingFormType) ?? "newsletter",
    formLink: row.form_link ?? "",
    complete: Boolean(row.complete),
    onboardingDocUrl: row.onboarding_doc_url ?? undefined,
    createdAt: toOptionalIsoString(row.created_at) ?? new Date(0).toISOString(),
  };
}

function mapBillingOnboarding(
  row: BillingOnboardingRow | undefined
): BillingOnboarding | undefined {
  if (!row) return undefined;
  return {
    formLink: row.form_link ?? "",
    complete: Boolean(row.complete),
    completedAt: toOptionalIsoString(row.completed_at),
    billingContactName: row.billing_contact_name ?? undefined,
    billingContactEmail: row.billing_contact_email ?? undefined,
    ioSigningContactName: row.io_signing_contact_name ?? undefined,
    ioSigningContactEmail: row.io_signing_contact_email ?? undefined,
    billingAddress: row.billing_address ?? undefined,
    poNumber: row.po_number ?? undefined,
    invoiceCadence: parseJsonValue<InvoiceCadence>(row.invoice_cadence),
    specialInstructions: row.special_instructions ?? undefined,
    uploadedDocUrl: row.uploaded_doc_url ?? undefined,
  };
}

function mapCampaign(
  row: CampaignRow,
  placements: Placement[],
  onboardingRounds: OnboardingRound[],
  billingOnboarding: BillingOnboarding | undefined
): Campaign {
  const extracted = extractCampaignPortalMeta(row.notes);
  const contacts =
    normalizeCampaignContacts(extracted.meta.contacts) ??
    (row.contact_name && row.contact_email
      ? [{ name: row.contact_name, email: row.contact_email.toLowerCase() }]
      : undefined);

  return {
    id: row.id,
    name: row.name,
    portalId: row.portal_id ?? row.id,
    clientId: row.client_id,
    category: (row.category as CampaignCategory) ?? "Standard",
    status: normalizeCampaignStatus(row.status),
    longTermClient: extracted.meta.longTermClient ?? undefined,
    complementaryCampaign: extracted.meta.complementaryCampaign ?? undefined,
    salesPerson: extracted.meta.salesPerson ?? undefined,
    campaignManager: normalizeCampaignManager(row.campaign_manager),
    currency: (row.currency as CampaignCurrency) ?? "CAD",
    taxEligible: row.tax_eligible ?? true,
    contactName: row.contact_name ?? undefined,
    contactEmail: row.contact_email?.toLowerCase() ?? undefined,
    contacts,
    adLineItems: parseJsonValue<AdLineItem[]>(row.ad_line_items),
    placementsDescription: row.placements_description ?? undefined,
    performanceTableUrl: row.performance_table_url ?? undefined,
    notes: extracted.cleanNotes ?? undefined,
    onboardingCampaignObjective: row.onboarding_campaign_objective ?? undefined,
    onboardingKeyMessage: row.onboarding_key_message ?? undefined,
    onboardingTalkingPoints: row.onboarding_talking_points ?? undefined,
    onboardingCallToAction: row.onboarding_call_to_action ?? undefined,
    onboardingTargetAudience: row.onboarding_target_audience ?? undefined,
    onboardingToneGuidelines: row.onboarding_tone_guidelines ?? undefined,
    onboardingSubmittedAt: toOptionalIsoString(row.onboarding_submitted_at),
    legacyOnboardingDocUrl: row.legacy_onboarding_doc_url ?? undefined,
    pandadocDocumentId: row.pandadoc_document_id ?? undefined,
    pandadocStatus: row.pandadoc_status ?? undefined,
    pandadocDocumentUrl: row.pandadoc_document_url ?? undefined,
    pandadocCreatedAt: toOptionalIsoString(row.pandadoc_created_at),
    onboardingRounds,
    billingOnboarding,
    placements,
    createdAt: toOptionalIsoString(row.created_at) ?? new Date(0).toISOString(),
  };
}

async function fetchCampaignRows(campaignId?: string): Promise<CampaignRow[]> {
  const result = campaignId
    ? await sql<CampaignRow>`
        select
          c.id,
          c.name,
          c.client_id,
          c.status,
          c.campaign_manager,
          c.contact_name,
          c.contact_email,
          c.ad_line_items,
          c.placements_description,
          c.performance_table_url,
          c.notes,
          c.created_at,
          to_jsonb(c)->>'portal_id' as portal_id,
          coalesce(to_jsonb(c)->>'category', 'Standard') as category,
          coalesce(to_jsonb(c)->>'currency', 'CAD') as currency,
          coalesce((to_jsonb(c)->>'tax_eligible')::boolean, true) as tax_eligible,
          coalesce(
            to_jsonb(c)->>'onboarding_campaign_objective',
            to_jsonb(c)->>'onboarding_messaging'
          ) as onboarding_campaign_objective,
          to_jsonb(c)->>'onboarding_key_message' as onboarding_key_message,
          to_jsonb(c)->>'onboarding_talking_points' as onboarding_talking_points,
          to_jsonb(c)->>'onboarding_call_to_action' as onboarding_call_to_action,
          to_jsonb(c)->>'onboarding_target_audience' as onboarding_target_audience,
          to_jsonb(c)->>'onboarding_tone_guidelines' as onboarding_tone_guidelines,
          c.onboarding_submitted_at,
          to_jsonb(c)->>'legacy_onboarding_doc_url' as legacy_onboarding_doc_url,
          to_jsonb(c)->>'pandadoc_document_id' as pandadoc_document_id,
          to_jsonb(c)->>'pandadoc_status' as pandadoc_status,
          to_jsonb(c)->>'pandadoc_document_url' as pandadoc_document_url,
          to_jsonb(c)->>'pandadoc_created_at' as pandadoc_created_at,
          cl.name as client_name,
          cl.portal_id as client_portal_id
        from campaigns c
        left join clients cl on cl.id = c.client_id
        where c.id = ${campaignId}
      `
    : await sql<CampaignRow>`
        select
          c.id,
          c.name,
          c.client_id,
          c.status,
          c.campaign_manager,
          c.contact_name,
          c.contact_email,
          c.ad_line_items,
          c.placements_description,
          c.performance_table_url,
          c.notes,
          c.created_at,
          to_jsonb(c)->>'portal_id' as portal_id,
          coalesce(to_jsonb(c)->>'category', 'Standard') as category,
          coalesce(to_jsonb(c)->>'currency', 'CAD') as currency,
          coalesce((to_jsonb(c)->>'tax_eligible')::boolean, true) as tax_eligible,
          coalesce(
            to_jsonb(c)->>'onboarding_campaign_objective',
            to_jsonb(c)->>'onboarding_messaging'
          ) as onboarding_campaign_objective,
          to_jsonb(c)->>'onboarding_key_message' as onboarding_key_message,
          to_jsonb(c)->>'onboarding_talking_points' as onboarding_talking_points,
          to_jsonb(c)->>'onboarding_call_to_action' as onboarding_call_to_action,
          to_jsonb(c)->>'onboarding_target_audience' as onboarding_target_audience,
          to_jsonb(c)->>'onboarding_tone_guidelines' as onboarding_tone_guidelines,
          c.onboarding_submitted_at,
          to_jsonb(c)->>'legacy_onboarding_doc_url' as legacy_onboarding_doc_url,
          to_jsonb(c)->>'pandadoc_document_id' as pandadoc_document_id,
          to_jsonb(c)->>'pandadoc_status' as pandadoc_status,
          to_jsonb(c)->>'pandadoc_document_url' as pandadoc_document_url,
          to_jsonb(c)->>'pandadoc_created_at' as pandadoc_created_at,
          cl.name as client_name,
          cl.portal_id as client_portal_id
        from campaigns c
        left join clients cl on cl.id = c.client_id
      `;

  return result.rows;
}

async function fetchPlacementRows(campaignId?: string): Promise<PlacementRow[]> {
  const result = campaignId
    ? await sql<PlacementRow>`
        select
          p.id,
          p.campaign_id,
          p.name,
          p.type,
          p.publication,
          p.scheduled_date,
          p.status,
          p.current_copy,
          p.copy_version,
          p.revision_notes,
          p.onboarding_round_id,
          p.copy_producer,
          p.notes,
          to_jsonb(p)->>'onboarding_brief' as onboarding_brief,
          p.stats,
          p.image_url,
          p.logo_url,
          p.link_to_placement,
          p.conflict_preference,
          p.beehiiv_post_id,
          p.created_at,
          p.published_at
        from placements p
        where p.campaign_id = ${campaignId}
      `
    : await sql<PlacementRow>`
        select
          p.id,
          p.campaign_id,
          p.name,
          p.type,
          p.publication,
          p.scheduled_date,
          p.status,
          p.current_copy,
          p.copy_version,
          p.revision_notes,
          p.onboarding_round_id,
          p.copy_producer,
          p.notes,
          to_jsonb(p)->>'onboarding_brief' as onboarding_brief,
          p.stats,
          p.image_url,
          p.logo_url,
          p.link_to_placement,
          p.conflict_preference,
          p.beehiiv_post_id,
          p.created_at,
          p.published_at
        from placements p
      `;

  return result.rows;
}

async function fetchOnboardingRoundRows(
  campaignId?: string
): Promise<OnboardingRoundRow[]> {
  const result = campaignId
    ? await sql<OnboardingRoundRow>`
        select
          r.id,
          r.campaign_id,
          r.label,
          coalesce(to_jsonb(r)->>'form_type', 'newsletter') as form_type,
          coalesce(
            to_jsonb(r)->>'form_link',
            to_jsonb(r)->>'fillout_link'
          ) as form_link,
          r.complete,
          r.onboarding_doc_url,
          r.created_at
        from onboarding_rounds r
        where r.campaign_id = ${campaignId}
      `
    : await sql<OnboardingRoundRow>`
        select
          r.id,
          r.campaign_id,
          r.label,
          coalesce(to_jsonb(r)->>'form_type', 'newsletter') as form_type,
          coalesce(
            to_jsonb(r)->>'form_link',
            to_jsonb(r)->>'fillout_link'
          ) as form_link,
          r.complete,
          r.onboarding_doc_url,
          r.created_at
        from onboarding_rounds r
      `;

  return result.rows;
}

async function fetchBillingOnboardingRows(
  campaignId?: string
): Promise<BillingOnboardingRow[]> {
  const result = campaignId
    ? await sql<BillingOnboardingRow>`
        select
          bo.campaign_id,
          coalesce(
            to_jsonb(bo)->>'form_link',
            to_jsonb(bo)->>'fillout_link'
          ) as form_link,
          bo.complete,
          bo.completed_at,
          bo.billing_contact_name,
          bo.billing_contact_email,
          to_jsonb(bo)->>'io_signing_contact_name' as io_signing_contact_name,
          to_jsonb(bo)->>'io_signing_contact_email' as io_signing_contact_email,
          bo.billing_address,
          bo.po_number,
          bo.invoice_cadence,
          bo.special_instructions,
          to_jsonb(bo)->>'uploaded_doc_url' as uploaded_doc_url
        from billing_onboarding bo
        where bo.campaign_id = ${campaignId}
      `
    : await sql<BillingOnboardingRow>`
        select
          bo.campaign_id,
          coalesce(
            to_jsonb(bo)->>'form_link',
            to_jsonb(bo)->>'fillout_link'
          ) as form_link,
          bo.complete,
          bo.completed_at,
          bo.billing_contact_name,
          bo.billing_contact_email,
          to_jsonb(bo)->>'io_signing_contact_name' as io_signing_contact_name,
          to_jsonb(bo)->>'io_signing_contact_email' as io_signing_contact_email,
          bo.billing_address,
          bo.po_number,
          bo.invoice_cadence,
          bo.special_instructions,
          to_jsonb(bo)->>'uploaded_doc_url' as uploaded_doc_url
        from billing_onboarding bo
      `;

  return result.rows;
}

async function buildCampaigns(campaignId?: string): Promise<DashboardCampaign[]> {
  const [campaignRows, placementRows, onboardingRoundRows, billingRows] =
    await Promise.all([
      fetchCampaignRows(campaignId),
      fetchPlacementRows(campaignId),
      fetchOnboardingRoundRows(campaignId),
      fetchBillingOnboardingRows(campaignId),
    ]);

  const placementsByCampaign = new Map<string, Placement[]>();
  for (const placementRow of placementRows) {
    const list = placementsByCampaign.get(placementRow.campaign_id) ?? [];
    list.push(mapPlacement(placementRow));
    placementsByCampaign.set(placementRow.campaign_id, list);
  }

  const onboardingRoundsByCampaign = new Map<string, OnboardingRound[]>();
  for (const roundRow of onboardingRoundRows) {
    const list = onboardingRoundsByCampaign.get(roundRow.campaign_id) ?? [];
    list.push(mapOnboardingRound(roundRow));
    onboardingRoundsByCampaign.set(roundRow.campaign_id, list);
  }

  const billingByCampaign = new Map<string, BillingOnboarding>();
  for (const billingRow of billingRows) {
    const billing = mapBillingOnboarding(billingRow);
    if (billing) {
      billingByCampaign.set(billingRow.campaign_id, billing);
    }
  }

  return campaignRows.map((campaignRow) => ({
    campaign: mapCampaign(
      campaignRow,
      placementsByCampaign.get(campaignRow.id) ?? [],
      (onboardingRoundsByCampaign.get(campaignRow.id) ?? []).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ),
      billingByCampaign.get(campaignRow.id)
    ),
    clientName: campaignRow.client_name ?? "",
    clientPortalId: campaignRow.client_portal_id ?? "",
  }));
}

export async function getAllCampaignsWithClientsForEmailAgent(): Promise<
  DashboardCampaign[]
> {
  return buildCampaigns();
}

export async function getCampaignByIdForEmailAgent(
  campaignId: string
): Promise<Campaign | null> {
  const campaigns = await buildCampaigns(campaignId);
  return campaigns[0]?.campaign ?? null;
}
