import type { Campaign, DashboardCampaign } from "../lib/types";

export interface EmailMessage {
  id: string;
  threadId: string;
  from: string;
  fromEmail: string;
  to: string;
  subject: string;
  bodyText: string;
  snippet: string;
  date: Date;
}

export interface EmailThread {
  id: string;
  messages: EmailMessage[];
}

export interface CampaignMatch {
  campaign: Campaign;
  clientName: string;
  matchedVia: "contactEmail" | "contacts" | "billingContact" | "ioSigningContact";
}

export interface DraftResult {
  threadId: string;
  draftId?: string;
  to: string;
  subject: string;
  body: string;
  matchedCampaigns: CampaignMatch[];
}

export interface ProcessedEmail {
  messageId: string;
  threadId: string;
  processedAt: string;
  draftCreated: boolean;
  matchedCampaignIds: string[];
}
