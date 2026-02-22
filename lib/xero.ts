import { XeroClient, TokenSet } from "xero-node";
import { eq } from "drizzle-orm";
import { db } from "./db/index";
import * as schema from "./db/schema";
import type { XeroInvoice, XeroInvoiceStatus } from "./xero-types";
import { customAlphabet } from "nanoid";

const nanoid = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 16);

const XERO_SCOPES =
  "openid profile email accounting.transactions.read offline_access";

export function createXeroClient(): XeroClient {
  return new XeroClient({
    clientId: process.env.XERO_CLIENT_ID!,
    clientSecret: process.env.XERO_CLIENT_SECRET!,
    redirectUris: [
      `${process.env.NEXT_PUBLIC_BASE_URL}/api/xero/callback`,
    ],
    scopes: XERO_SCOPES.split(" "),
  });
}

// ─── Connection helpers ─────────────────────────────────────

interface XeroConnection {
  id: string;
  tenantId: string;
  tenantName: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export async function getXeroConnection(): Promise<XeroConnection | null> {
  const row = await db.query.xeroConnections.findFirst();
  if (!row) return null;

  // Auto-refresh if token expires within 5 minutes
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
  if (row.expiresAt <= fiveMinutesFromNow) {
    try {
      const client = createXeroClient();
      await client.initialize();
      const tokenSet = await client.refreshWithRefreshToken(
        process.env.XERO_CLIENT_ID!,
        process.env.XERO_CLIENT_SECRET!,
        row.refreshToken
      );

      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + (tokenSet.expires_in ?? 1800) * 1000
      );

      await db
        .update(schema.xeroConnections)
        .set({
          accessToken: tokenSet.access_token!,
          refreshToken: tokenSet.refresh_token ?? row.refreshToken,
          expiresAt,
          updatedAt: now,
        })
        .where(eq(schema.xeroConnections.id, row.id));

      return {
        id: row.id,
        tenantId: row.tenantId,
        tenantName: row.tenantName,
        accessToken: tokenSet.access_token!,
        refreshToken: tokenSet.refresh_token ?? row.refreshToken,
        expiresAt,
      };
    } catch {
      // If refresh fails, delete the connection so user can reconnect
      await db
        .delete(schema.xeroConnections)
        .where(eq(schema.xeroConnections.id, row.id));
      return null;
    }
  }

  return {
    id: row.id,
    tenantId: row.tenantId,
    tenantName: row.tenantName,
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    expiresAt: row.expiresAt,
  };
}

export async function isXeroConnected(): Promise<{
  connected: boolean;
  tenantName?: string;
}> {
  const conn = await getXeroConnection();
  if (!conn) return { connected: false };
  return { connected: true, tenantName: conn.tenantName };
}

// ─── Invoice fetching ───────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapXeroInvoice(raw: Record<string, any>): XeroInvoice {
  return {
    invoiceID: raw.invoiceID ?? raw.InvoiceID ?? "",
    invoiceNumber: raw.invoiceNumber ?? raw.InvoiceNumber ?? "",
    contact: {
      contactID: raw.contact?.contactID ?? raw.Contact?.ContactID ?? "",
      name: raw.contact?.name ?? raw.Contact?.Name ?? "",
    },
    date: raw.date ?? raw.Date ?? "",
    dueDate: raw.dueDate ?? raw.DueDate ?? "",
    status: (raw.status ?? raw.Status ?? "DRAFT") as XeroInvoiceStatus,
    total: raw.total ?? raw.Total ?? 0,
    amountDue: raw.amountDue ?? raw.AmountDue ?? 0,
    amountPaid: raw.amountPaid ?? raw.AmountPaid ?? 0,
    currencyCode: raw.currencyCode ?? raw.CurrencyCode ?? "USD",
  };
}

export async function fetchXeroInvoices(
  tenantId: string,
  accessToken: string,
  filters?: { statuses?: string[]; searchTerm?: string }
): Promise<XeroInvoice[]> {
  const client = createXeroClient();
  await client.initialize();
  client.setTokenSet({ access_token: accessToken } as TokenSet);

  const response = await client.accountingApi.getInvoices(
    tenantId,
    undefined, // ifModifiedSince
    filters?.statuses ? `Status=="${filters.statuses.join('" OR Status=="')}"` : undefined, // where
    "Date DESC", // order
    undefined, // iDs
    undefined, // invoiceNumbers
    undefined, // contactIDs
    filters?.statuses, // statuses
    undefined, // page
    undefined, // includeArchived
    undefined, // createdByMyApp
    undefined, // unitdp
    true, // summaryOnly
    100, // pageSize
    filters?.searchTerm // searchTerm
  );

  const invoices = response.body?.invoices ?? [];
  return invoices.map(mapXeroInvoice);
}

export async function fetchXeroInvoice(
  tenantId: string,
  accessToken: string,
  invoiceId: string
): Promise<XeroInvoice | null> {
  try {
    const client = createXeroClient();
    await client.initialize();
    client.setTokenSet({ access_token: accessToken } as TokenSet);

    const response = await client.accountingApi.getInvoice(
      tenantId,
      invoiceId
    );
    const invoices = response.body?.invoices ?? [];
    if (invoices.length === 0) return null;
    return mapXeroInvoice(invoices[0]);
  } catch {
    return null;
  }
}

// ─── Connection storage ─────────────────────────────────────

export async function saveXeroConnection(params: {
  tenantId: string;
  tenantName: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + params.expiresIn * 1000);

  // Delete any existing connection (single-team connection)
  await db.delete(schema.xeroConnections);

  await db.insert(schema.xeroConnections).values({
    id: nanoid(),
    tenantId: params.tenantId,
    tenantName: params.tenantName,
    accessToken: params.accessToken,
    refreshToken: params.refreshToken,
    expiresAt,
    createdAt: now,
    updatedAt: now,
  });
}

export async function deleteXeroConnection() {
  await db.delete(schema.xeroConnections);
}
