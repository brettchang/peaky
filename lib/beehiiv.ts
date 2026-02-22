import type { PerformanceStats } from "./types";

const API_BASE = "https://api.beehiiv.com/v2";

function getHeaders(): Record<string, string> {
  const key = process.env.BEEHIIV_API_KEY;
  if (!key) throw new Error("BEEHIIV_API_KEY is not set");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

function getPublicationId(): string {
  const id = process.env.BEEHIIV_PUBLICATION_ID;
  if (!id) throw new Error("BEEHIIV_PUBLICATION_ID is not set");
  return id;
}

// ─── URL normalization ──────────────────────────────────────

/** Strips protocol, www., trailing slash, lowercases for comparison */
export function normalizeUrl(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
}

// ─── Beehiiv API types ──────────────────────────────────────

interface BeehiivClickEntry {
  url: string;
  base_url: string;
  total_clicks: number;
  total_unique_clicks: number;
  total_click_through_rate: number;
}

interface BeehiivPostStats {
  recipients?: number;
  opens?: number;
  unique_opens?: number;
  open_rate?: number;
  clicks?: BeehiivClickEntry[];
}

interface BeehiivPost {
  id: string;
  title?: string;
  publish_date?: number; // Unix timestamp in seconds
  stats?: BeehiivPostStats;
}

interface BeehiivListResponse {
  data: BeehiivPost[];
  page: number;
  total_pages: number;
}

// ─── API methods ────────────────────────────────────────────

/** Fetch a single post by ID with stats expanded */
export async function fetchPostById(
  postId: string
): Promise<BeehiivPost | null> {
  const pubId = getPublicationId();
  const res = await fetch(
    `${API_BASE}/publications/${pubId}/posts/${postId}?expand[]=stats`,
    { headers: getHeaders() }
  );
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Beehiiv API error: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  return json.data as BeehiivPost;
}

/**
 * Paginate through Beehiiv posts to find one whose click data contains
 * the given linkToPlacement URL. Uses a +/-3 day window around scheduledDate
 * to limit the search scope.
 */
export async function findPostByLink(
  linkToPlacement: string,
  scheduledDate?: string
): Promise<{ post: BeehiivPost; clickEntry: BeehiivClickEntry } | null> {
  const pubId = getPublicationId();
  const normalizedLink = normalizeUrl(linkToPlacement);

  // Build date window (±3 days around scheduled date, or no bounds)
  let windowStart: number | null = null;
  let windowEnd: number | null = null;
  if (scheduledDate) {
    const d = new Date(scheduledDate);
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    windowStart = Math.floor((d.getTime() - threeDays) / 1000);
    windowEnd = Math.floor((d.getTime() + threeDays) / 1000);
  }

  const maxPages = 10;

  for (let page = 1; page <= maxPages; page++) {
    const url = new URL(`${API_BASE}/publications/${pubId}/posts`);
    url.searchParams.set("expand[]", "stats");
    url.searchParams.set("order_by", "publish_date");
    url.searchParams.set("direction", "desc");
    url.searchParams.set("limit", "100");
    url.searchParams.set("page", String(page));

    const res = await fetch(url.toString(), { headers: getHeaders() });
    if (!res.ok) {
      throw new Error(`Beehiiv API error: ${res.status} ${res.statusText}`);
    }
    const json: BeehiivListResponse = await res.json();
    const posts = json.data;

    if (!posts || posts.length === 0) break;

    for (const post of posts) {
      // If we have a date window and this post is before the window start, stop
      if (windowStart && post.publish_date && post.publish_date < windowStart) {
        return null; // Posts are sorted desc, so all remaining are older
      }

      // Skip posts outside the window (too new)
      if (windowEnd && post.publish_date && post.publish_date > windowEnd) {
        continue;
      }

      // Check click data for matching URL
      const clicks = post.stats?.clicks;
      if (clicks) {
        for (const click of clicks) {
          if (normalizeUrl(click.base_url) === normalizedLink) {
            return { post, clickEntry: click };
          }
        }
      }
    }

    // Stop if we've reached the last page
    if (page >= json.total_pages) break;
  }

  return null;
}

// ─── Stats extraction ───────────────────────────────────────

/** Normalize a rate value — Beehiiv may return 0.45 (decimal) or 45.0 (percent) */
function normalizeRate(value: number | undefined): number | undefined {
  if (value == null) return undefined;
  // If the value is > 1, assume it's already a percentage
  if (value > 1) return Math.round(value * 100) / 100;
  // Otherwise convert decimal to percentage
  return Math.round(value * 10000) / 100;
}

/** Extract PerformanceStats from a Beehiiv post + optional matched click entry */
export function extractStats(
  post: BeehiivPost,
  clickEntry?: BeehiivClickEntry | null
): PerformanceStats {
  const s = post.stats;
  const stats: PerformanceStats = {};

  // Newsletter-level stats
  if (s?.recipients != null) stats.totalSends = s.recipients;
  if (s?.opens != null) stats.totalOpens = s.opens;
  if (s?.unique_opens != null) stats.uniqueOpens = s.unique_opens;
  if (s?.open_rate != null) stats.openRate = normalizeRate(s.open_rate);

  // Ad-specific stats from matched click entry
  if (clickEntry) {
    if (clickEntry.total_clicks != null)
      stats.totalClicks = clickEntry.total_clicks;
    if (clickEntry.total_unique_clicks != null)
      stats.uniqueClicks = clickEntry.total_unique_clicks;
  }

  return stats;
}
