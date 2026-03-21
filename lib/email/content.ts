const HTML_BREAK_TAGS = /<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|hr)\b[^>]*>/gi;
const HTML_OPEN_BLOCK_TAGS = /<(p|div|li|tr|h[1-6])\b[^>]*>/gi;
const HTML_TAGS = /<[^>]+>/g;
const NBSP = /&nbsp;|&#160;/gi;
const AMP = /&amp;/gi;
const LT = /&lt;/gi;
const GT = /&gt;/gi;
const QUOT = /&quot;/gi;
const APOS = /&#39;|&apos;/gi;
const MULTI_NEWLINES = /\n{3,}/g;
const MULTI_SPACES = /[ \t]{2,}/g;
const URL_PATTERN = /https?:\/\/[^\s<]+/g;

const QUOTE_MARKERS = [
  /(?:\n|^|\s)On .+? wrote:\s*/i,
  /(?:\n|^|\s)-{2,}\s*Original Message\s*-{2,}/i,
  /(?:\n|^|\s)Get Outlook for iOS/i,
];

const HEADER_BLOCK_MARKERS = [
  "from:",
  "date:",
  "sent:",
  "to:",
  "cc:",
  "subject:",
] as const;

function decodeEntities(value: string): string {
  return value
    .replace(NBSP, " ")
    .replace(AMP, "&")
    .replace(LT, "<")
    .replace(GT, ">")
    .replace(QUOT, '"')
    .replace(APOS, "'");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripQuotedHtml(value: string): string {
  return value
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "")
    .replace(/<div[^>]+class=(["'])gmail_quote\1[\s\S]*?<\/div>/gi, "")
    .replace(/<div[^>]+id=(["'])appendonsend\1[\s\S]*?<\/div>/gi, "");
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(MULTI_SPACES, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(MULTI_NEWLINES, "\n\n")
    .trim();
}

function findQuotedHeaderBlockStart(value: string): number | null {
  const lower = value.toLowerCase();
  const fromMatches = Array.from(lower.matchAll(/\bfrom:\s/g));

  for (const match of fromMatches) {
    const index = match.index ?? -1;
    if (index <= 0) continue;
    const tail = lower.slice(index);
    const headerCount = HEADER_BLOCK_MARKERS.filter((marker) => tail.includes(marker)).length;
    if (headerCount >= 3) {
      return index;
    }
  }

  return null;
}

export function extractVisibleReplyText(value: string | undefined): string {
  if (!value) return "";
  let output = normalizeWhitespace(value);
  const headerBlockStart = findQuotedHeaderBlockStart(output);

  if (headerBlockStart !== null) {
    output = output.slice(0, headerBlockStart).trim();
  }

  for (const marker of QUOTE_MARKERS) {
    const match = output.match(marker);
    if (match?.index !== undefined) {
      output = output.slice(0, match.index).trim();
      break;
    }
  }
  return output;
}

export function htmlToReadableText(value: string | undefined): string {
  if (!value) return "";
  const withoutQuoted = stripQuotedHtml(value);
  const withLineBreaks = withoutQuoted
    .replace(HTML_BREAK_TAGS, "\n")
    .replace(HTML_OPEN_BLOCK_TAGS, "\n")
    .replace(/<\/td>/gi, " ")
    .replace(/<\/th>/gi, " ");
  const plainText = decodeEntities(withLineBreaks).replace(HTML_TAGS, " ");
  return extractVisibleReplyText(plainText);
}

export function cleanEmailSnippet(value: string | undefined): string {
  return extractVisibleReplyText(decodeEntities(value || "")).replace(/\s+/g, " ").trim();
}

export function splitReadableParagraphs(value: string | undefined): string[] {
  const cleaned = extractVisibleReplyText(decodeEntities(value || ""));
  if (!cleaned) return [];
  return cleaned
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function draftToComposerText(input: {
  bodyText?: string;
  bodyHtml?: string;
}): string {
  const preferred = extractVisibleReplyText(input.bodyText || "");
  if (preferred) {
    return preferred;
  }
  return htmlToReadableText(input.bodyHtml);
}

export function replyTextToHtml(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return "";
  }

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => {
      const lines = paragraph
        .split("\n")
        .map((line) => escapeHtml(line.trim()))
        .join("<br>");
      return `<p>${lines}</p>`;
    })
    .join("");
}

function splitHtmlParagraphs(value: string): string[] {
  const paragraphs = Array.from(
    value.matchAll(/<(p|div)\b[^>]*>([\s\S]*?)<\/\1>/gi),
    (match) => match[2].trim()
  ).filter(Boolean);
  return paragraphs;
}

function linkifyPlainTextParagraph(value: string): string {
  return escapeHtml(value).replace(URL_PATTERN, (url) => `<a href="${url}">${url}</a>`);
}

function paragraphsToMissiveHtml(paragraphs: string[]): string {
  return paragraphs
    .map((paragraph, index) => {
      const spacer = index < paragraphs.length - 1 ? "<div><br></div>" : "";
      return `<div>${paragraph}</div>${spacer}`;
    })
    .join("");
}

export function formatHtmlForMissiveComposer(input: {
  bodyHtml?: string;
  bodyText?: string;
}): string {
  const htmlParagraphs = splitHtmlParagraphs(input.bodyHtml?.trim() || "");
  if (htmlParagraphs.length > 0) {
    return paragraphsToMissiveHtml(htmlParagraphs);
  }

  const textParagraphs = extractVisibleReplyText(input.bodyText || "")
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .split("\n")
        .map((line) => linkifyPlainTextParagraph(line.trim()))
        .join("<br>")
        .trim()
    )
    .filter(Boolean);

  if (textParagraphs.length > 0) {
    return paragraphsToMissiveHtml(textParagraphs);
  }

  return input.bodyHtml?.trim() || "";
}
