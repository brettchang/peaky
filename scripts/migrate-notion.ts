import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { sql } from "@vercel/postgres";
import { drizzle } from "drizzle-orm/vercel-postgres";
import * as schema from "../lib/db/schema";
import { generatePortalId } from "../lib/client-ids";
import type { CampaignStatus, PlacementStatus, PlacementType, Publication } from "../lib/types";

type NotionPropertyValue = {
  type: string;
  title?: Array<{ plain_text: string }>;
  rich_text?: Array<{ plain_text: string }>;
  status?: { name?: string };
  select?: { name?: string };
  email?: string;
  phone_number?: string;
  date?: { start?: string };
  relation?: Array<{ id: string }>;
};

type NotionPage = {
  id: string;
  created_time: string;
  properties: Record<string, NotionPropertyValue>;
};

const db = drizzle(sql, { schema });

const CAMPAIGNS_DB_ID =
  process.env.NOTION_CAMPAIGNS_DB_ID ||
  "285875657877808a8098d0ac0607e133";
const ADS_DB_ID =
  process.env.NOTION_ADS_DB_ID ||
  "28587565787780ceab7fe7a0ecba9160";
const NOTION_API_KEY = process.env.NOTION_API_KEY;

const IS_DRY_RUN = process.argv.includes("--dry-run");
const TODAY = new Date().toISOString().slice(0, 10);

function compactId(id: string): string {
  return id.replace(/-/g, "");
}

function getTitle(props: Record<string, NotionPropertyValue>, candidates: string[]): string | undefined {
  for (const key of candidates) {
    const p = props[key];
    if (p?.type === "title" && p.title?.length) {
      const value = p.title.map((t) => t.plain_text).join("").trim();
      if (value) return value;
    }
  }

  for (const p of Object.values(props)) {
    if (p.type === "title" && p.title?.length) {
      const value = p.title.map((t) => t.plain_text).join("").trim();
      if (value) return value;
    }
  }

  return undefined;
}

function getText(props: Record<string, NotionPropertyValue>, candidates: string[]): string | undefined {
  for (const key of candidates) {
    const p = props[key];
    if (!p) continue;

    if (p.type === "rich_text") {
      const value = p.rich_text?.map((t) => t.plain_text).join("").trim();
      if (value) return value;
    }

    if (p.type === "status") {
      const value = p.status?.name?.trim();
      if (value) return value;
    }

    if (p.type === "select") {
      const value = p.select?.name?.trim();
      if (value) return value;
    }

    if (p.type === "email") {
      const value = p.email?.trim();
      if (value) return value;
    }

    if (p.type === "phone_number") {
      const value = p.phone_number?.trim();
      if (value) return value;
    }
  }
  return undefined;
}

function getStatus(props: Record<string, NotionPropertyValue>, candidates: string[]): string | undefined {
  return getText(props, candidates);
}

function getEmail(props: Record<string, NotionPropertyValue>, candidates: string[]): string | undefined {
  const maybe = getText(props, candidates);
  if (!maybe) return undefined;
  return maybe.includes("@") ? maybe : undefined;
}

function getDate(props: Record<string, NotionPropertyValue>, candidates: string[]): string | undefined {
  for (const key of candidates) {
    const p = props[key];
    if (p?.type === "date") {
      const start = p.date?.start;
      if (start) return start.slice(0, 10);
    }
  }

  for (const p of Object.values(props)) {
    if (p.type === "date") {
      const start = p.date?.start;
      if (start) return start.slice(0, 10);
    }
  }

  return undefined;
}

function getRelationIds(props: Record<string, NotionPropertyValue>, candidates: string[]): string[] {
  for (const key of candidates) {
    const p = props[key];
    if (p?.type === "relation") {
      return (p.relation ?? []).map((r) => compactId(r.id));
    }
  }

  for (const p of Object.values(props)) {
    if (p.type === "relation") {
      return (p.relation ?? []).map((r) => compactId(r.id));
    }
  }

  return [];
}

function normalizeCampaignStatus(input?: string): CampaignStatus {
  const value = (input || "").toLowerCase();
  if (value.includes("active")) return "Active";
  if (value.includes("placement") && value.includes("complete")) return "Placements Completed";
  if (value.includes("wrap")) return "Wrapped";
  if (value.includes("onboarding") && value.includes("complete")) return "Onboarding Form Complete";
  return "Waiting on Onboarding";
}

function normalizePlacementStatus(input?: string): PlacementStatus {
  const value = (input || "").toLowerCase();
  if (value.includes("approved")) return "Approved";
  if (value.includes("sent") && value.includes("approval")) return "Sent for Approval";
  if (value.includes("review")) return "Peak Team Review Complete";
  if (value.includes("copy")) return "Copywriting in Progress";
  return "New Campaign";
}

function normalizePlacementType(input?: string): PlacementType {
  const value = (input || "").toLowerCase();
  if (value.includes("primary")) return "Primary";
  if (value.includes("secondary")) return "Secondary";
  if (value.includes("pick")) return "Peak Picks";
  if (value.includes("beehiv") || value.includes("beehiiv")) return "Beehiv";
  if (value.includes("smart")) return "Smart Links";
  if (value.includes("bls")) return "BLS";
  if (value.includes("podcast")) return "Podcast Ad";
  return "Primary";
}

function normalizePublication(input?: string): Publication {
  const value = (input || "").toLowerCase();
  if (value.includes("money")) return "Peak Money";
  return "The Peak";
}

async function notionQueryDatabase(databaseId: string): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;

  for (;;) {
    const response = await fetch(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${NOTION_API_KEY}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({
          page_size: 100,
          start_cursor: cursor,
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Notion query failed (${response.status}): ${text}`);
    }

    const data = (await response.json()) as {
      results: NotionPage[];
      has_more: boolean;
      next_cursor?: string;
    };

    pages.push(...data.results);

    if (!data.has_more) break;
    cursor = data.next_cursor;
  }

  return pages;
}

async function migrate() {
  if (!NOTION_API_KEY) {
    throw new Error("NOTION_API_KEY is missing. Add it to .env.local first.");
  }

  console.log(`Starting Notion migration${IS_DRY_RUN ? " (dry run)" : ""}...`);
  console.log(`Campaign DB: ${CAMPAIGNS_DB_ID}`);
  console.log(`Ads DB: ${ADS_DB_ID}`);
  console.log(`Today cutoff (upcoming placements): ${TODAY}`);

  const [campaignPages, adPages] = await Promise.all([
    notionQueryDatabase(CAMPAIGNS_DB_ID),
    notionQueryDatabase(ADS_DB_ID),
  ]);

  const activeCampaignPages = campaignPages.filter((page) => {
    const rawStatus = getStatus(page.properties, ["Status", "Campaign Status", "status"]);
    const status = normalizeCampaignStatus(rawStatus);
    return status === "Active";
  });

  const activeCampaignIds = new Set(
    activeCampaignPages.map((c) => compactId(c.id))
  );

  const upcomingAdPages = adPages.filter((page) => {
    const date = getDate(page.properties, ["Date", "Scheduled Date", "Publish Date", "Placement Date"]);
    if (!date || date < TODAY) return false;

    const relatedCampaignIds = getRelationIds(page.properties, ["Campaign", "Campaigns", "Campaign ID"]);
    if (relatedCampaignIds.length === 0) return false;

    return relatedCampaignIds.some((id) => activeCampaignIds.has(id));
  });

  console.log(`Found ${campaignPages.length} campaigns in Notion (${activeCampaignPages.length} active).`);
  console.log(`Found ${adPages.length} placements in Notion (${upcomingAdPages.length} upcoming for active campaigns).`);

  const existingClients = await db.query.clients.findMany();
  const clientIdByName = new Map(
    existingClients.map((c) => [c.name.trim().toLowerCase(), c.id])
  );

  const localCampaignIdByNotionId = new Map<string, string>();

  let insertedClients = 0;
  let upsertedCampaigns = 0;
  let upsertedBillingOnboarding = 0;
  let upsertedPlacements = 0;

  for (const campaignPage of activeCampaignPages) {
    const notionCampaignId = compactId(campaignPage.id);
    const campaignId = `campaign-notion-${notionCampaignId}`;

    const campaignName =
      getTitle(campaignPage.properties, ["Campaign Name", "Name", "Campaign"]) ||
      `Notion Campaign ${notionCampaignId.slice(0, 6)}`;

    const clientName =
      getText(campaignPage.properties, ["Client", "Client Name", "Advertiser", "Account"]) ||
      "Unknown Client";

    const clientKey = clientName.trim().toLowerCase();
    let clientId = clientIdByName.get(clientKey);

    if (!clientId) {
      clientId = `client-notion-${notionCampaignId.slice(0, 12)}`;
      if (!IS_DRY_RUN) {
        await db.insert(schema.clients).values({
          id: clientId,
          name: clientName,
          portalId: generatePortalId(),
        });
      }
      clientIdByName.set(clientKey, clientId);
      insertedClients += 1;
    }

    const rawStatus = getStatus(campaignPage.properties, ["Status", "Campaign Status", "status"]);
    const campaignStatus = normalizeCampaignStatus(rawStatus);

    const campaignManager = getText(campaignPage.properties, [
      "Campaign Manager",
      "CM",
      "Campaign Owner",
    ]);
    const contactName = getText(campaignPage.properties, [
      "Primary Contact",
      "Contact",
      "Contact Name",
    ]);
    const contactEmail = getEmail(campaignPage.properties, [
      "Primary Contact Email",
      "Email",
      "Contact Email",
    ]);

    if (!IS_DRY_RUN) {
      await db
        .insert(schema.campaigns)
        .values({
          id: campaignId,
          name: campaignName,
          clientId,
          status: campaignStatus,
          campaignManager: campaignManager ?? null,
          contactName: contactName ?? null,
          contactEmail: contactEmail ?? null,
          createdAt: new Date(campaignPage.created_time),
        })
        .onConflictDoUpdate({
          target: schema.campaigns.id,
          set: {
            name: campaignName,
            clientId,
            status: campaignStatus,
            campaignManager: campaignManager ?? null,
            contactName: contactName ?? null,
            contactEmail: contactEmail ?? null,
          },
        });
    }
    upsertedCampaigns += 1;

    if (!IS_DRY_RUN) {
      await db
        .insert(schema.billingOnboarding)
        .values({
          id: `billing-notion-${notionCampaignId}`,
          campaignId,
          filloutLink: `https://thepeakquiz.fillout.com/t/uDNyXt4Ttsus?campaign_id=${campaignId}&form_type=billing`,
          complete: false,
        })
        .onConflictDoUpdate({
          target: schema.billingOnboarding.campaignId,
          set: {
            filloutLink: `https://thepeakquiz.fillout.com/t/uDNyXt4Ttsus?campaign_id=${campaignId}&form_type=billing`,
          },
        });
    }
    upsertedBillingOnboarding += 1;

    localCampaignIdByNotionId.set(notionCampaignId, campaignId);
  }

  for (const adPage of upcomingAdPages) {
    const notionAdId = compactId(adPage.id);
    const relationCampaignIds = getRelationIds(adPage.properties, ["Campaign", "Campaigns", "Campaign ID"]);
    const matchedNotionCampaignId = relationCampaignIds.find((id) =>
      localCampaignIdByNotionId.has(id)
    );
    if (!matchedNotionCampaignId) continue;

    const campaignId = localCampaignIdByNotionId.get(matchedNotionCampaignId)!;
    const placementName =
      getTitle(adPage.properties, ["Name", "Placement", "Title"]) ||
      `Placement ${notionAdId.slice(0, 6)}`;
    const scheduledDate = getDate(adPage.properties, [
      "Date",
      "Scheduled Date",
      "Publish Date",
      "Placement Date",
    ]);

    if (!scheduledDate || scheduledDate < TODAY) continue;

    const rawType = getText(adPage.properties, ["Type", "Placement Type"]);
    const rawPublication = getText(adPage.properties, ["Publication", "Newsletter"]);
    const rawStatus = getStatus(adPage.properties, ["Status", "Placement Status"]);

    const type = normalizePlacementType(rawType);
    const publication = normalizePublication(rawPublication);
    const status = normalizePlacementStatus(rawStatus);

    if (!IS_DRY_RUN) {
      await db
        .insert(schema.placements)
        .values({
          id: `placement-notion-${notionAdId}`,
          campaignId,
          name: placementName,
          type,
          publication,
          scheduledDate,
          status,
          currentCopy: "",
          copyVersion: 0,
          createdAt: new Date(adPage.created_time),
        })
        .onConflictDoUpdate({
          target: schema.placements.id,
          set: {
            campaignId,
            name: placementName,
            type,
            publication,
            scheduledDate,
            status,
          },
        });
    }
    upsertedPlacements += 1;
  }

  console.log("Migration complete.");
  console.log(`Clients inserted: ${insertedClients}`);
  console.log(`Campaigns upserted: ${upsertedCampaigns}`);
  console.log(`Billing onboarding upserted: ${upsertedBillingOnboarding}`);
  console.log(`Placements upserted: ${upsertedPlacements}`);
}

migrate().catch((err) => {
  console.error("Notion migration failed:", err);
  process.exit(1);
});
