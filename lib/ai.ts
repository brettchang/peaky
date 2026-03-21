import Anthropic from "@anthropic-ai/sdk";
import type { PlacementType } from "./types";
import { getSetting } from "./db";
import {
  AI_COPY_PROMPT_KEY,
  AI_PODCAST_SCRIPT_PROMPT_KEY,
  DEFAULT_AI_COPY_PROMPT,
  DEFAULT_AI_PODCAST_SCRIPT_PROMPT,
} from "./ai-constants";

const anthropic = new Anthropic();
const DEFAULT_COPY_MODEL = "claude-sonnet-4-20250514";
const COPY_MODEL =
  process.env.ANTHROPIC_COPY_MODEL?.trim() || DEFAULT_COPY_MODEL;

export {
  AI_COPY_PROMPT_KEY,
  AI_PODCAST_SCRIPT_PROMPT_KEY,
  DEFAULT_AI_COPY_PROMPT,
  DEFAULT_AI_PODCAST_SCRIPT_PROMPT,
};

interface PlacementInput {
  id: string;
  name: string;
  type: PlacementType;
  publication: string;
  brief: string;
  scheduledDate?: string;
}

interface GeneratedCopy {
  placementId: string;
  copy: string;
}

const WORD_COUNTS: Record<PlacementType, string> = {
  Primary: "150-200 words",
  Secondary: "80-120 words",
  "Peak Picks": "40-60 words",
  Beehiv: "100-150 words",
  "Smart Links": "30-50 words",
  BLS: "80-120 words",
  "Podcast Ad": "60-90 words",
  ":30 Pre-Roll": "60-90 words",
  ":30 Mid-Roll": "60-90 words",
  "15 Minute Interview": "8-12 interview questions",
};

function applyTemplateVariables(
  prompt: string,
  vars: Record<string, string>
): string {
  return prompt.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match);
}

export async function generateCopyForPlacements(input: {
  campaignName: string;
  clientName: string;
  campaignObjective: string;
  keyMessage: string;
  talkingPoints: string;
  callToAction: string;
  targetAudience: string;
  toneGuidelines: string;
  placements: PlacementInput[];
}): Promise<GeneratedCopy[]> {
  const [rawCopyPrompt, rawPodcastScriptPrompt] = await Promise.all([
    getSetting(AI_COPY_PROMPT_KEY),
    getSetting(AI_PODCAST_SCRIPT_PROMPT_KEY),
  ]);

  const legacyMessaging = [
    `Campaign objective: ${input.campaignObjective}`,
    `Key message: ${input.keyMessage}`,
    `Talking points: ${input.talkingPoints}`,
    `Call to action: ${input.callToAction}`,
    `Target audience: ${input.targetAudience}`,
    `Tone / brand guidelines: ${input.toneGuidelines}`,
  ].join("\n");

  const templateVars = {
    campaignName: input.campaignName,
    clientName: input.clientName,
    campaignObjective: input.campaignObjective,
    keyMessage: input.keyMessage,
    talkingPoints: input.talkingPoints,
    callToAction: input.callToAction,
    targetAudience: input.targetAudience,
    toneGuidelines: input.toneGuidelines,
    messaging: legacyMessaging,
    desiredAction: input.callToAction,
  };

  const hostReadPodcastPlacements = input.placements.filter(
    (p) => p.type === ":30 Pre-Roll" || p.type === ":30 Mid-Roll"
  );
  const standardPlacements = input.placements.filter(
    (p) => p.type !== ":30 Pre-Roll" && p.type !== ":30 Mid-Roll"
  );

  const [standardResults, hostReadResults] = await Promise.all([
    standardPlacements.length > 0
      ? generateBatchCopy({
          placements: standardPlacements,
          rawPrompt: rawCopyPrompt || DEFAULT_AI_COPY_PROMPT,
          templateVars,
        })
      : Promise.resolve([]),
    hostReadPodcastPlacements.length > 0
      ? generateBatchCopy({
          placements: hostReadPodcastPlacements,
          rawPrompt: rawPodcastScriptPrompt || DEFAULT_AI_PODCAST_SCRIPT_PROMPT,
          templateVars,
        })
      : Promise.resolve([]),
  ]);

  return [...standardResults, ...hostReadResults];
}

async function generateBatchCopy(input: {
  placements: PlacementInput[];
  rawPrompt: string;
  templateVars: Record<string, string>;
}): Promise<GeneratedCopy[]> {
  const templatePrompt = applyTemplateVariables(input.rawPrompt, input.templateVars);
  const systemPrompt = `${templatePrompt}

Non-negotiable instruction priority:
1) Placement-specific brief for each placement (highest priority for that placement).
2) Campaign-level onboarding answers.
3) Type/length formatting constraints.

If a placement brief asks for a specific theme or angle, use that theme for that placement while keeping claims accurate.
If campaign context is sparse, infer reasonable specifics from the available context and still produce publication-ready copy.
Never ask for more information, never request onboarding answers, and never output a checklist of missing details.`;

  const placementDescriptions = input.placements
    .map(
      (p, i) =>
        `Placement ${i + 1} (ID: ${p.id}):
  - Name: ${p.name}
  - Type: ${p.type}
  - Publication: ${p.publication}
  - Target length: ${WORD_COUNTS[p.type]}
  - Placement-specific request: ${p.brief || "None provided; rely on campaign onboarding answers"}
  ${p.scheduledDate ? `- Scheduled: ${p.scheduledDate}` : ""}`
    )
    .join("\n\n");

  const response = await anthropic.messages.create({
    model: COPY_MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Write ad copy for the following placements. Treat each placement independently.

${placementDescriptions}

Return your response as a JSON array with objects containing "placementId" and "copy" fields. Only output the JSON array, no other text.`,
      },
    ],
  });

  const text = extractTextBlocks(response.content);
  const parsed = tryParseGeneratedCopyArray(text);
  if (parsed) {
    const byId = new Map(input.placements.map((placement) => [placement.id, placement]));
    const output: GeneratedCopy[] = [];

    for (const item of parsed) {
      const placement = byId.get(item.placementId);
      if (!placement) {
        output.push(item);
        continue;
      }

      if (!isMetaNonCopyResponse(item.copy)) {
        output.push(item);
        continue;
      }

      const regenerated = await generateSinglePlacementCopy(
        placement,
        buildStrictNoQuestionsPrompt(systemPrompt)
      );
      output.push({ placementId: placement.id, copy: regenerated });
    }

    return output;
  }

  // Fallback: generate one placement at a time using plain text output
  return generatePerPlacementFallback(input.placements, systemPrompt);
}

function extractTextBlocks(
  blocks: Array<{ type: string; text?: string }>
): string {
  return blocks
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("\n\n")
    .trim();
}

function tryParseGeneratedCopyArray(text: string): GeneratedCopy[] | null {
  const candidates: string[] = [];
  if (text.trim()) candidates.push(text.trim());

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  const extractedArray = extractFirstJsonArray(text);
  if (extractedArray) candidates.push(extractedArray);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const normalized = normalizeGeneratedCopyArray(parsed);
      if (normalized) return normalized;
    } catch {
      // Try next candidate shape.
    }
  }

  return null;
}

function extractFirstJsonArray(text: string): string | null {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }

    if (ch === "[") {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }

    if (ch === "]" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

function normalizeGeneratedCopyArray(value: unknown): GeneratedCopy[] | null {
  const arrayValue =
    Array.isArray(value)
      ? value
      : value &&
          typeof value === "object" &&
          "results" in value &&
          Array.isArray((value as { results?: unknown }).results)
        ? (value as { results: unknown[] }).results
        : null;

  if (!arrayValue) return null;

  const normalized = arrayValue
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const placementId = (item as { placementId?: unknown }).placementId;
      const copy = (item as { copy?: unknown }).copy;
      if (typeof placementId !== "string" || typeof copy !== "string") return null;
      const trimmedId = placementId.trim();
      const trimmedCopy = copy.trim();
      if (!trimmedId || !trimmedCopy) return null;
      return { placementId: trimmedId, copy: trimmedCopy };
    })
    .filter((item): item is GeneratedCopy => Boolean(item));

  return normalized.length > 0 ? normalized : null;
}

async function generatePerPlacementFallback(
  placements: PlacementInput[],
  systemPrompt: string
): Promise<GeneratedCopy[]> {
  const results: GeneratedCopy[] = [];

  for (const placement of placements) {
    let copy = await generateSinglePlacementCopy(placement, systemPrompt);
    if (isMetaNonCopyResponse(copy)) {
      copy = await generateSinglePlacementCopy(
        placement,
        buildStrictNoQuestionsPrompt(systemPrompt)
      );
    }

    if (!copy || isMetaNonCopyResponse(copy)) {
      throw new Error(`Failed to generate copy for placement ${placement.id}`);
    }

    results.push({ placementId: placement.id, copy });
  }

  return results;
}

function buildStrictNoQuestionsPrompt(basePrompt: string): string {
  return `${basePrompt}

Final output rule:
- Always produce final ad copy.
- Never ask for more info.
- Never mention missing onboarding details.`;
}

function isMetaNonCopyResponse(text: string): boolean {
  const normalized = text.toLowerCase();
  return [
    "no campaign onboarding answers",
    "please supply the campaign onboarding",
    "once those details are provided",
    "missing onboarding details",
    "need campaign onboarding details",
  ].some((phrase) => normalized.includes(phrase));
}

async function generateSinglePlacementCopy(
  placement: PlacementInput,
  systemPrompt: string
): Promise<string> {
  const response = await anthropic.messages.create({
    model: COPY_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Write ad copy for this one placement.

Placement (ID: ${placement.id}):
- Name: ${placement.name}
- Type: ${placement.type}
- Publication: ${placement.publication}
- Target length: ${WORD_COUNTS[placement.type]}
- Placement-specific request: ${placement.brief || "None provided; rely on campaign onboarding answers"}
${placement.scheduledDate ? `- Scheduled: ${placement.scheduledDate}` : ""}

Return only the final copy text, with no JSON and no preamble.`,
      },
    ],
  });

  return extractTextBlocks(response.content).trim();
}
