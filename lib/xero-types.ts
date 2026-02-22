// === Xero invoice statuses ===
export type XeroInvoiceStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "AUTHORISED"
  | "PAID"
  | "VOIDED"
  | "DELETED";

export interface XeroInvoiceContact {
  contactID: string;
  name: string;
}

export interface XeroInvoice {
  invoiceID: string;
  invoiceNumber: string;
  contact: XeroInvoiceContact;
  date: string;
  dueDate: string;
  status: XeroInvoiceStatus;
  total: number;
  amountDue: number;
  amountPaid: number;
  currencyCode: string;
}

export interface CampaignInvoiceLink {
  id: string;
  campaignId: string;
  xeroInvoiceId: string;
  linkedAt: string;
  notes?: string;
  invoice?: XeroInvoice;
}
