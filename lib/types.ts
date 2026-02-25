// === Notion Ad Calendar statuses (placement-level) ===
export type PlacementStatus =
  | "New Campaign"
  | "Copywriting in Progress"
  | "Peak Team Review Complete"
  | "Sent for Approval"
  | "Approved"
  | "Onboarding Requested"
  | "Drafting Script"
  | "Script Review by Client"
  | "Approved Script"
  | "Audio Sent for Approval"
  | "Audio Sent"
  | "Audio Approved"
  | "Drafting Questions"
  | "Questions In Review"
  | "Client Reviewing Interview"
  | "Revising for Client"
  | "Approved Interview";

// === Notion Campaigns DB statuses (campaign-level) ===
export type CampaignStatus =
  | "Waiting on Onboarding"
  | "Onboarding Form Complete"
  | "Active"
  | "Placements Completed"
  | "Wrapped";

// === Client-facing placement statuses ===
export type ClientDisplayStatus =
  | "New Campaign"
  | "Copywriting in Progress"
  | "Peak Team Review Complete"
  | "Sent for Approval"
  | "Approved"
  | "Onboarding Requested"
  | "Drafting Script"
  | "Script Review by Client"
  | "Approved Script"
  | "Audio Sent for Approval"
  | "Audio Sent"
  | "Audio Approved"
  | "Drafting Questions"
  | "Questions In Review"
  | "Client Reviewing Interview"
  | "Revising for Client"
  | "Approved Interview";

export function getClientDisplayStatus(status: PlacementStatus): ClientDisplayStatus {
  switch (status) {
    case "New Campaign":
      return "New Campaign";
    case "Copywriting in Progress":
    case "Peak Team Review Complete":
    case "Sent for Approval":
    case "Approved":
    case "Onboarding Requested":
    case "Drafting Script":
    case "Script Review by Client":
    case "Approved Script":
    case "Audio Sent for Approval":
    case "Audio Sent":
    case "Audio Approved":
    case "Drafting Questions":
    case "Questions In Review":
    case "Client Reviewing Interview":
    case "Revising for Client":
    case "Approved Interview":
      return status;
    default:
      return "Copywriting in Progress";
  }
}

// === Notion Ad Calendar placement types ===
export type PlacementType =
  | "Primary"
  | "Secondary"
  | "Peak Picks"
  | "Beehiv"
  | "Smart Links"
  | "BLS"
  | "Podcast Ad"
  | ":30 Pre-Roll"
  | ":30 Mid-Roll"
  | "15 Minute Interview";

export const NEWSLETTER_PLACEMENT_TYPES: PlacementType[] = [
  "Primary",
  "Secondary",
  "Peak Picks",
  "Beehiv",
  "Smart Links",
  "BLS",
  "Podcast Ad",
];

export const PODCAST_PLACEMENT_TYPES: PlacementType[] = [
  ":30 Pre-Roll",
  ":30 Mid-Roll",
  "15 Minute Interview",
];

// === Daily capacity limits per placement type (per publication, weekdays only) ===
// null = unlimited
export const DAILY_CAPACITY_LIMITS: Record<PlacementType, number | null> = {
  Primary: 1,
  Secondary: 1,
  "Peak Picks": 4,
  Beehiv: null,
  "Smart Links": null,
  BLS: null,
  "Podcast Ad": null,
  ":30 Pre-Roll": null,
  ":30 Mid-Roll": null,
  "15 Minute Interview": null,
};

// === Capacity / scheduling types ===

export interface SlotCapacity {
  publication: Publication;
  type: PlacementType;
  used: number;
  limit: number | null;
  available: number | null;
}

export interface DayCapacity {
  date: string;
  slots: SlotCapacity[];
}

export interface DateRangeCapacity {
  startDate: string;
  endDate: string;
  days: DayCapacity[];
}

// === Notion Ad Calendar publications ===
export type Publication = "The Peak" | "Peak Money" | "Peak Daily Podcast";

export const PODCAST_PUBLICATION: Publication = "Peak Daily Podcast";

export const PUBLICATIONS: Array<{ value: Publication; label: string }> = [
  { value: "The Peak", label: "The Peak Daily Newsletter" },
  { value: "Peak Money", label: "Peak Money" },
  { value: PODCAST_PUBLICATION, label: "Peak Daily Podcast" },
];

export const NEWSLETTER_PLACEMENT_STATUSES: PlacementStatus[] = [
  "New Campaign",
  "Copywriting in Progress",
  "Peak Team Review Complete",
  "Sent for Approval",
  "Approved",
];

export const PODCAST_SPOT_PLACEMENT_STATUSES: PlacementStatus[] = [
  "Onboarding Requested",
  "Drafting Script",
  "Script Review by Client",
  "Approved Script",
  "Audio Sent for Approval",
  "Audio Approved",
];

export const PODCAST_INTERVIEW_PLACEMENT_STATUSES: PlacementStatus[] = [
  "Onboarding Requested",
  "Drafting Questions",
  "Questions In Review",
  "Client Reviewing Interview",
  "Revising for Client",
  "Approved Interview",
];

export function isPodcastPublication(publication: Publication): boolean {
  return publication === PODCAST_PUBLICATION;
}

export function isPodcastInterviewType(type: PlacementType): boolean {
  return type === "15 Minute Interview";
}

export function isPodcastPlacement(type: PlacementType, publication: Publication): boolean {
  return (
    isPodcastPublication(publication) ||
    type === ":30 Pre-Roll" ||
    type === ":30 Mid-Roll" ||
    type === "15 Minute Interview"
  );
}

export function getPlacementStatusesFor(
  type: PlacementType,
  publication: Publication
): PlacementStatus[] {
  if (!isPodcastPlacement(type, publication)) {
    return NEWSLETTER_PLACEMENT_STATUSES;
  }
  if (isPodcastInterviewType(type)) {
    return PODCAST_INTERVIEW_PLACEMENT_STATUSES;
  }
  return PODCAST_SPOT_PLACEMENT_STATUSES;
}

export function getDefaultPlacementStatus(
  type: PlacementType,
  publication: Publication
): PlacementStatus {
  return isPodcastPlacement(type, publication)
    ? "Onboarding Requested"
    : "New Campaign";
}

export function isClientReviewStatus(status: PlacementStatus): boolean {
  return (
    status === "Peak Team Review Complete" ||
    status === "Sent for Approval" ||
    status === "Script Review by Client" ||
    status === "Audio Sent for Approval" ||
    status === "Audio Sent" ||
    status === "Questions In Review" ||
    status === "Client Reviewing Interview"
  );
}

export function isApprovedStatus(status: PlacementStatus): boolean {
  return (
    status === "Approved" ||
    status === "Approved Script" ||
    status === "Audio Approved" ||
    status === "Approved Interview"
  );
}

export function getPlacementWorkflowGroup(
  status: PlacementStatus
): "needs-action" | "in-review" | "approved" {
  if (isApprovedStatus(status)) return "approved";
  if (
    status === "Peak Team Review Complete" ||
    status === "Sent for Approval" ||
    status === "Script Review by Client" ||
    status === "Audio Sent for Approval" ||
    status === "Audio Sent" ||
    status === "Questions In Review" ||
    status === "Client Reviewing Interview"
  ) {
    return "in-review";
  }
  return "needs-action";
}

export interface CopyVersion {
  version: number;
  copyText: string;
  createdAt: string;
  revisionNotes?: string;
}

export interface OnboardingRound {
  id: string;
  label?: string;
  filloutLink: string;
  complete: boolean;
  onboardingDocUrl?: string;
  createdAt: string;
}

// === Performance stats from Ad Calendar fields ===
export interface PerformanceStats {
  openRate?: number;
  totalOpens?: number;
  uniqueOpens?: number;
  totalClicks?: number;
  uniqueClicks?: number;
  totalSends?: number;
  ctr?: number;
  adRevenue?: number;
}

export interface Placement {
  id: string;
  name: string;                       // Ad Calendar "Name" (title)
  type: PlacementType;
  publication: Publication;
  scheduledDate?: string;             // Ad Calendar "Date"
  scheduledEndDate?: string;
  interviewScheduled?: boolean;
  status: PlacementStatus;
  currentCopy: string;
  copyVersion: number;
  revisionNotes?: string;
  revisionHistory: CopyVersion[];
  onboardingRoundId?: string;
  copyProducer?: "Us" | "Client";
  notes?: string;
  onboardingBrief?: string;
  stats?: PerformanceStats;           // inline from Ad Calendar fields
  imageUrl?: string;
  logoUrl?: string;
  linkToPlacement?: string;
  conflictPreference?: "Defer if conflict" | "Date is crucial";
  beehiivPostId?: string;
  createdAt: string;
  publishedAt?: string;
}

export interface AdLineItem {
  quantity: number;
  type: PlacementType;
  publication?: Publication;
  pricePerUnit: number;
}

// === Invoice cadence types ===
export type InvoiceCadenceType = "lump-sum" | "equal-monthly" | "per-month-usage";

export interface LumpSumInvoice {
  type: "lump-sum";
  totalAmount: number;
  paymentTerms: string; // e.g. "net-30"
}

export interface EqualMonthlyInvoice {
  type: "equal-monthly";
  totalAmount: number;
  numberOfMonths: number;
  monthlyAmount: number; // totalAmount / numberOfMonths
}

export interface PerMonthUsageInvoice {
  type: "per-month-usage";
  // No extra fields — rates come from campaign.adLineItems
}

export type InvoiceCadence = LumpSumInvoice | EqualMonthlyInvoice | PerMonthUsageInvoice;

export interface BillingOnboarding {
  filloutLink: string;
  complete: boolean;
  completedAt?: string;
  companyName?: string;
  billingContactName?: string;
  billingContactEmail?: string;
  billingAddress?: string;
  poNumber?: string;
  invoiceCadence?: InvoiceCadence;
  specialInstructions?: string;
  uploadedDocUrl?: string;
}

export interface CampaignContact {
  name: string;
  email: string;
}

export interface Campaign {
  id: string;
  name: string;                       // "Campaign Name"
  clientId: string;
  status: CampaignStatus;
  salesPerson?: string;
  campaignManager?: string;
  contactName?: string;
  contactEmail?: string;
  contacts?: CampaignContact[];
  adLineItems?: AdLineItem[];
  placementsDescription?: string;     // "Placements" text field
  onboardingRounds: OnboardingRound[];
  performanceTableUrl?: string;
  billingOnboarding?: BillingOnboarding;
  notes?: string;
  onboardingMessaging?: string;
  onboardingDesiredAction?: string;
  onboardingSubmittedAt?: string;
  placements: Placement[];
  createdAt: string;
}

export function isOnboardingEditable(campaign: Campaign): boolean {
  return campaign.status === "Waiting on Onboarding" || campaign.status === "Onboarding Form Complete";
}

export interface Client {
  id: string;
  name: string;
  portalId: string;
  campaignIds: string[];
}

export interface CampaignPageData {
  client: Client;
  campaign: Campaign;
}

export interface DashboardCampaign {
  campaign: Campaign;
  clientName: string;
  clientPortalId: string;
}

export interface ClientPlacementRow {
  campaignId: string;
  campaignName: string;
  placement: Placement;
}
