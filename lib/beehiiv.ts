import type { PerformanceStats } from "./types";

const API_BASE = "https://api.beehiiv.com/v2";
const PEAK_MONEY_PUBLICATION_ID = "pub_ede4ea1a-d509-49a3-a398-5f4ee9e114a1";

function getHeaders(): Record<string, string> {
  const key = process.env.BEEHIIV_API_KEY;
  if (!key) throw new Error("BEEHIIV_API_KEY is not set");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

function getDefaultPublicationId(): string {
  const id = process.env.BEEHIIV_PUBLICATION_ID;
  if (!id) throw new Error("BEEHIIV_PUBLICATION_ID is not set");
  return id;
}

function getPublicationIdForPlacement(publication?: string): string {
  if (publication === "Peak Money") {
    return PEAK_MONEY_PUBLICATION_ID;
  }
  return getDefaultPublicationId();
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

/** Keeps query params so placement links with distinct UTMs remain unique */
export function normalizeUrlPreservingQuery(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/#.*$/, "")
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
  // Beehiiv returns email-level stats nested under stats.email
  email?: {
    recipients?: number;
    opens?: number;
    unique_opens?: number;
    open_rate?: number;
  };
  // Legacy/fallback shape support (in case API payload varies)
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

const BEEHIIV_PUBLICATION_TIME_ZONE = "America/Toronto";

function formatTimestampAsDate(
  timestampSeconds: number,
  timeZone = BEEHIIV_PUBLICATION_TIME_ZONE
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestampSeconds * 1000));
}

export function getPostScheduledDate(
  post: Pick<BeehiivPost, "publish_date">,
  timeZone = BEEHIIV_PUBLICATION_TIME_ZONE
): string | null {
  if (!post.publish_date) return null;
  return formatTimestampAsDate(post.publish_date, timeZone);
}

export function doesPostMatchScheduledDate(
  post: Pick<BeehiivPost, "publish_date">,
  scheduledDate?: string
): boolean {
  if (!scheduledDate) return true;
  const postDate = getPostScheduledDate(post);
  return postDate === scheduledDate;
}

function getCalendarDayDistance(post: Pick<BeehiivPost, "publish_date">, scheduledDate: string): number {
  const postDate = getPostScheduledDate(post);
  if (!postDate) return Number.POSITIVE_INFINITY;

  const postUtc = Date.parse(`${postDate}T00:00:00Z`);
  const scheduledUtc = Date.parse(`${scheduledDate}T00:00:00Z`);
  return Math.abs(postUtc - scheduledUtc);
}

export function findMatchingClickEntry(
  clicks: BeehiivClickEntry[],
  linkToPlacement: string
): BeehiivClickEntry | null {
  const normalizedFullLink = normalizeUrlPreservingQuery(linkToPlacement);
  const exactUrlMatch =
    clicks.find(
      (click) =>
        typeof click.url === "string" &&
        normalizeUrlPreservingQuery(click.url) === normalizedFullLink
    ) ?? null;
  if (exactUrlMatch) return exactUrlMatch;

  const normalizedBaseLink = normalizeUrl(linkToPlacement);
  return (
    clicks.find((click) => normalizeUrl(click.base_url) === normalizedBaseLink) ??
    null
  );
}

// ─── API methods ────────────────────────────────────────────

/** Fetch a single post by ID with stats expanded */
export async function fetchPostById(
  postId: string,
  publication?: string
): Promise<BeehiivPost | null> {
  const pubId = getPublicationIdForPlacement(publication);
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
 * the given linkToPlacement URL. Prefer an exact scheduled-date match when the
 * same URL appears in multiple sends, then fall back to the nearest post inside
 * a +/-3 day search window.
 */
export async function findPostByLink(
  linkToPlacement: string,
  scheduledDate?: string,
  publication?: string
): Promise<{ post: BeehiivPost; clickEntry: BeehiivClickEntry } | null> {
  const pubId = getPublicationIdForPlacement(publication);

  // Build date window (±3 days around scheduled date, or no bounds)
  let windowStart: number | null = null;
  let windowEnd: number | null = null;
  if (scheduledDate) {
    const d = new Date(`${scheduledDate}T12:00:00Z`);
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    windowStart = Math.floor((d.getTime() - threeDays) / 1000);
    windowEnd = Math.floor((d.getTime() + threeDays) / 1000);
  }

  const maxPages = 10;

  let bestNearbyMatch:
    | {
        post: BeehiivPost;
        clickEntry: BeehiivClickEntry;
        dateDistance: number;
      }
    | null = null;

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
        const clickEntry = findMatchingClickEntry(clicks, linkToPlacement);
        if (clickEntry) {
          if (scheduledDate && doesPostMatchScheduledDate(post, scheduledDate)) {
            return { post, clickEntry };
          }

          const dateDistance = scheduledDate
            ? getCalendarDayDistance(post, scheduledDate)
            : Number.POSITIVE_INFINITY;

          if (
            !bestNearbyMatch ||
            dateDistance < bestNearbyMatch.dateDistance
          ) {
            bestNearbyMatch = { post, clickEntry, dateDistance };
          }
        }
      }
    }

    // Stop if we've reached the last page
    if (page >= json.total_pages) break;
  }

  if (bestNearbyMatch) {
    return {
      post: bestNearbyMatch.post,
      clickEntry: bestNearbyMatch.clickEntry,
    };
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
  const email = s?.email;
  const stats: PerformanceStats = {};

  // Newsletter-level stats
  if (email?.recipients != null) stats.totalSends = email.recipients;
  else if (s?.recipients != null) stats.totalSends = s.recipients;

  if (email?.opens != null) stats.totalOpens = email.opens;
  else if (s?.opens != null) stats.totalOpens = s.opens;

  if (email?.unique_opens != null) stats.uniqueOpens = email.unique_opens;
  else if (s?.unique_opens != null) stats.uniqueOpens = s.unique_opens;

  if (email?.open_rate != null) stats.openRate = normalizeRate(email.open_rate);
  else if (s?.open_rate != null) stats.openRate = normalizeRate(s.open_rate);

  // Ad-specific stats from matched click entry
  if (clickEntry) {
    if (clickEntry.total_clicks != null)
      stats.totalClicks = clickEntry.total_clicks;
    if (clickEntry.total_unique_clicks != null)
      stats.uniqueClicks = clickEntry.total_unique_clicks;
  }

  return stats;
}
