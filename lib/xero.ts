import { eq } from "drizzle-orm";
import { db } from "./db/index";
import * as schema from "./db/schema";
import type { XeroInvoice, XeroInvoiceStatus } from "./xero-types";
import { customAlphabet } from "nanoid";

const nanoid = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 16);

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
      const clientId = process.env.XERO_CLIENT_ID!;
      const clientSecret = process.env.XERO_CLIENT_SECRET!;

      const refreshResponse = await fetch(
        "https://identity.xero.com/connect/token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: row.refreshToken,
          }),
        }
      );

      if (!refreshResponse.ok) throw new Error("Refresh failed");
      const tokenData = await refreshResponse.json();

      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + (tokenData.expires_in ?? 1800) * 1000
      );

      await db
        .update(schema.xeroConnections)
        .set({
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token ?? row.refreshToken,
          expiresAt,
          updatedAt: now,
        })
        .where(eq(schema.xeroConnections.id, row.id));

      return {
        id: row.id,
        tenantId: row.tenantId,
        tenantName: row.tenantName,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? row.refreshToken,
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
  const mappedDate = normalizeXeroDate(raw.date ?? raw.Date);
  const mappedDueDate = normalizeXeroDate(raw.dueDate ?? raw.DueDate);

  return {
    invoiceID: raw.invoiceID ?? raw.InvoiceID ?? "",
    invoiceNumber: raw.invoiceNumber ?? raw.InvoiceNumber ?? "",
    contact: {
      contactID: raw.contact?.contactID ?? raw.Contact?.ContactID ?? "",
      name: raw.contact?.name ?? raw.Contact?.Name ?? "",
    },
    date: mappedDate,
    dueDate: mappedDueDate,
    status: (raw.status ?? raw.Status ?? "DRAFT") as XeroInvoiceStatus,
    total: raw.total ?? raw.Total ?? 0,
    amountDue: raw.amountDue ?? raw.AmountDue ?? 0,
    amountPaid: raw.amountPaid ?? raw.AmountPaid ?? 0,
    currencyCode: raw.currencyCode ?? raw.CurrencyCode ?? "USD",
  };
}

function normalizeXeroDate(rawValue: unknown): string {
  if (rawValue == null) return "";

  // Handles Xero legacy format like "/Date(1710460800000+0000)/"
  if (typeof rawValue === "string") {
    const legacyMatch = rawValue.match(/\/Date\((\d+)(?:[+-]\d+)?\)\//);
    if (legacyMatch?.[1]) {
      const ms = Number(legacyMatch[1]);
      if (!Number.isNaN(ms)) {
        return new Date(ms).toISOString().slice(0, 10);
      }
    }

    // Handles ISO datetime and plain YYYY-MM-DD
    const parsed = new Date(rawValue);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
    return "";
  }

  if (typeof rawValue === "number") {
    const parsed = new Date(rawValue);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  return "";
}

export async function fetchXeroInvoices(
  tenantId: string,
  accessToken: string,
  filters?: { statuses?: string[]; searchTerm?: string }
): Promise<XeroInvoice[]> {
  const params = new URLSearchParams({
    order: "Date DESC",
    summaryOnly: "true",
    pageSize: "100",
  });
  if (filters?.statuses?.length) {
    params.set("statuses", filters.statuses.join(","));
  }
  if (filters?.searchTerm) {
    params.set("searchTerm", filters.searchTerm);
  }

  const response = await fetch(
    `https://api.xero.com/api.xro/2.0/Invoices?${params}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": tenantId,
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) return [];
  const data = await response.json();
  return (data.Invoices ?? []).map(mapXeroInvoice);
}

export async function fetchXeroInvoice(
  tenantId: string,
  accessToken: string,
  invoiceId: string
): Promise<XeroInvoice | null> {
  try {
    const response = await fetch(
      `https://api.xero.com/api.xro/2.0/Invoices/${invoiceId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Xero-Tenant-Id": tenantId,
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) return null;
    const data = await response.json();
    const invoices = data.Invoices ?? [];
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
