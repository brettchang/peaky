// === Notion Ad Calendar statuses (placement-level) ===
export type PlacementStatus =
  | "New Campaign"
  | "Copywriting in Progress"
  | "Peak Team Review Complete"
  | "Sent for Approval"
  | "Approved";

// === Notion Campaigns DB statuses (campaign-level) ===
export type CampaignStatus =
  | "Waiting on Onboarding"
  | "Onboarding Form Complete"
  | "Active"
  | "Placements Completed"
  | "Wrapped";

// === Simplified status for client-facing portal display ===
export type ClientDisplayStatus =
  | "In Progress"
  | "Ready for Review"
  | "Approved";

export function getClientDisplayStatus(status: PlacementStatus): ClientDisplayStatus {
  switch (status) {
    case "Sent for Approval":
      return "Ready for Review";
    case "Approved":
      return "Approved";
    default:
      return "In Progress";
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
  | "Podcast Ad";

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
export type Publication = "The Peak" | "Peak Money";

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
  billingContactName?: string;
  billingContactEmail?: string;
  billingAddress?: string;
  poNumber?: string;
  invoiceCadence?: InvoiceCadence;
  specialInstructions?: string;
  uploadedDocUrl?: string;
}

export interface Campaign {
  id: string;
  name: string;                       // "Campaign Name"
  clientId: string;
  status: CampaignStatus;
  campaignManager?: string;
  contactName?: string;
  contactEmail?: string;
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
