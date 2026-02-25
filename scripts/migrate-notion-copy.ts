import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { sql } from "@vercel/postgres";
import { drizzle } from "drizzle-orm/vercel-postgres";
import * as schema from "../lib/db/schema";

type NotionRichText = { plain_text?: string };

type NotionPropertyValue = {
  type: string;
  rich_text?: NotionRichText[];
  title?: NotionRichText[];
};

type NotionPage = {
  id: string;
  properties: Record<string, NotionPropertyValue>;
};

type NotionBlock = {
  id: string;
  type: string;
  has_children?: boolean;
  paragraph?: { rich_text?: NotionRichText[] };
  heading_1?: { rich_text?: NotionRichText[] };
  heading_2?: { rich_text?: NotionRichText[] };
  heading_3?: { rich_text?: NotionRichText[] };
  bulleted_list_item?: { rich_text?: NotionRichText[] };
  numbered_list_item?: { rich_text?: NotionRichText[] };
  to_do?: { rich_text?: NotionRichText[] };
  toggle?: { rich_text?: NotionRichText[] };
  quote?: { rich_text?: NotionRichText[] };
  callout?: { rich_text?: NotionRichText[] };
  code?: { rich_text?: NotionRichText[] };
};

type NotionChildrenResponse = {
  results: NotionBlock[];
  has_more: boolean;
  next_cursor?: string;
};

const db = drizzle(sql, { schema });
const NOTION_API_KEY = process.env.NOTION_API_KEY;

const IS_DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

function compactId(id: string): string {
  return id.replace(/-/g, "");
}

function getPropertyText(
  props: Record<string, NotionPropertyValue>,
  candidates: string[]
): string | undefined {
  for (const key of candidates) {
    const p = props[key];
    if (!p) continue;

    if (p.type === "rich_text") {
      const text = (p.rich_text ?? []).map((t) => t.plain_text ?? "").join("").trim();
      if (text) return text;
    }

    if (p.type === "title") {
      const text = (p.title ?? []).map((t) => t.plain_text ?? "").join("").trim();
      if (text) return text;
    }
  }

  return undefined;
}

function getAllRichTextPropertyText(
  props: Record<string, NotionPropertyValue>
): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(props)) {
    if (value.type !== "rich_text") continue;
    const text = (value.rich_text ?? [])
      .map((t) => t.plain_text ?? "")
      .join("")
      .trim();
    if (!text) continue;

    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey.includes("status") ||
      normalizedKey.includes("campaign") ||
      normalizedKey.includes("publication")
    ) {
      continue;
    }

    parts.push(text);
  }
  return parts.join("\n\n").trim();
}

async function notionGetPage(pageId: string): Promise<NotionPage> {
  const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Notion page fetch failed (${response.status}): ${text}`);
  }

  return (await response.json()) as NotionPage;
}

async function notionGetBlockChildren(blockId: string): Promise<NotionBlock[]> {
  const all: NotionBlock[] = [];
  let cursor: string | undefined;

  for (;;) {
    const params = new URLSearchParams({ page_size: "100" });
    if (cursor) params.set("start_cursor", cursor);

    const response = await fetch(
      `https://api.notion.com/v1/blocks/${blockId}/children?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${NOTION_API_KEY}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Notion block children failed (${response.status}): ${text}`);
    }

    const data = (await response.json()) as NotionChildrenResponse;
    all.push(...data.results);

    if (!data.has_more) break;
    cursor = data.next_cursor;
  }

  return all;
}

function richTextToString(richText?: NotionRichText[]): string {
  return (richText ?? [])
    .map((t) => t.plain_text ?? "")
    .join("")
    .trim();
}

function blockToLine(block: NotionBlock): string | null {
  switch (block.type) {
    case "heading_1": {
      const text = richTextToString(block.heading_1?.rich_text);
      return text ? `# ${text}` : null;
    }
    case "heading_2": {
      const text = richTextToString(block.heading_2?.rich_text);
      return text ? `## ${text}` : null;
    }
    case "heading_3": {
      const text = richTextToString(block.heading_3?.rich_text);
      return text ? `### ${text}` : null;
    }
    case "bulleted_list_item": {
      const text = richTextToString(block.bulleted_list_item?.rich_text);
      return text ? `- ${text}` : null;
    }
    case "numbered_list_item": {
      const text = richTextToString(block.numbered_list_item?.rich_text);
      return text ? `1. ${text}` : null;
    }
    case "to_do": {
      const text = richTextToString(block.to_do?.rich_text);
      return text ? `- ${text}` : null;
    }
    case "toggle": {
      const text = richTextToString(block.toggle?.rich_text);
      return text || null;
    }
    case "quote": {
      const text = richTextToString(block.quote?.rich_text);
      return text ? `> ${text}` : null;
    }
    case "callout": {
      const text = richTextToString(block.callout?.rich_text);
      return text || null;
    }
    case "code": {
      const text = richTextToString(block.code?.rich_text);
      return text || null;
    }
    case "paragraph": {
      const text = richTextToString(block.paragraph?.rich_text);
      return text || null;
    }
    default:
      return null;
  }
}

async function extractNotionPageCopy(pageIdCompact: string): Promise<string> {
  const pageId =
    `${pageIdCompact.slice(0, 8)}-${pageIdCompact.slice(8, 12)}-${pageIdCompact.slice(12, 16)}-${pageIdCompact.slice(16, 20)}-${pageIdCompact.slice(20)}`;

  const page = await notionGetPage(pageId);

  const propertyCopy = getPropertyText(page.properties, [
    "Copy",
    "Ad Copy",
    "Content",
    "Body",
    "Draft",
  ]);
  const fallbackPropertyCopy = getAllRichTextPropertyText(page.properties);

  const rootChildren = await notionGetBlockChildren(pageId);
  const lines: string[] = [];

  async function walk(blocks: NotionBlock[]) {
    for (const block of blocks) {
      const line = blockToLine(block);
      if (line) lines.push(line);

      if (block.has_children) {
        const children = await notionGetBlockChildren(block.id);
        await walk(children);
      }
    }
  }

  await walk(rootChildren);

  const blockCopy = lines.join("\n\n").trim();

  const mergedPropertyCopy = (propertyCopy || fallbackPropertyCopy || "").trim();

  if (mergedPropertyCopy && blockCopy) {
    if (blockCopy.includes(mergedPropertyCopy)) return blockCopy;
    return `${mergedPropertyCopy}\n\n${blockCopy}`.trim();
  }

  return (mergedPropertyCopy || blockCopy || "").trim();
}

async function migrateCopy() {
  if (!NOTION_API_KEY) {
    throw new Error("NOTION_API_KEY is missing. Add it to .env.local first.");
  }

  console.log(`Starting Notion copy backfill${IS_DRY_RUN ? " (dry run)" : ""}${FORCE ? " (force)" : ""}...`);

  const placements = await db.query.placements.findMany();
  const notionPlacements = placements.filter((p) => p.id.startsWith("placement-notion-"));

  console.log(`Found ${notionPlacements.length} imported Notion placements.`);

  let scanned = 0;
  let skippedExisting = 0;
  let noCopyFound = 0;
  let updated = 0;
  let failed = 0;

  for (const placement of notionPlacements) {
    scanned += 1;

    const hasExisting = placement.currentCopy.trim().length > 0;
    if (hasExisting && !FORCE) {
      skippedExisting += 1;
      continue;
    }

    const notionId = placement.id.replace("placement-notion-", "");
    try {
      const extractedCopy = await extractNotionPageCopy(notionId);
      if (!extractedCopy) {
        noCopyFound += 1;
        continue;
      }

      if (!IS_DRY_RUN) {
        await db
          .update(schema.placements)
          .set({
            currentCopy: extractedCopy,
            copyVersion: placement.copyVersion > 0 ? placement.copyVersion : 1,
          })
          .where(eq(schema.placements.id, placement.id));
      }

      updated += 1;
      if (updated <= 10) {
        console.log(`Updated: ${placement.id} (${extractedCopy.length} chars)`);
      }
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed: ${placement.id} - ${message}`);
    }
  }

  console.log("Copy backfill complete.");
  console.log(`Scanned: ${scanned}`);
  console.log(`Skipped (already had copy): ${skippedExisting}`);
  console.log(`No copy found in Notion page: ${noCopyFound}`);
  console.log(`${IS_DRY_RUN ? "Would update" : "Updated"}: ${updated}`);
  console.log(`Failed: ${failed}`);
}

migrateCopy().catch((err) => {
  console.error("Notion copy backfill failed:", err);
  process.exit(1);
});
