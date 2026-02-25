import Anthropic from "@anthropic-ai/sdk";
import type { PlacementType } from "./types";
import { getSetting } from "./db";
import { AI_COPY_PROMPT_KEY, DEFAULT_AI_COPY_PROMPT } from "./ai-constants";

const anthropic = new Anthropic();

export { AI_COPY_PROMPT_KEY, DEFAULT_AI_COPY_PROMPT };

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
  messaging: string;
  desiredAction: string;
  placements: PlacementInput[];
}): Promise<GeneratedCopy[]> {
  const rawPrompt = await getSetting(AI_COPY_PROMPT_KEY) || DEFAULT_AI_COPY_PROMPT;
  const templatePrompt = applyTemplateVariables(rawPrompt, {
    campaignName: input.campaignName,
    clientName: input.clientName,
    messaging: input.messaging,
    desiredAction: input.desiredAction,
  });
  const systemPrompt = `${templatePrompt}

Non-negotiable instruction priority:
1) Placement-specific brief for each placement (highest priority for that placement).
2) Campaign-level messaging and desired action.
3) Type/length formatting constraints.

If a placement brief asks for a specific theme or angle, use that theme for that placement even when the campaign messaging is broader.`;

  const placementDescriptions = input.placements
    .map(
      (p, i) =>
        `Placement ${i + 1} (ID: ${p.id}):
  - Name: ${p.name}
  - Type: ${p.type}
  - Publication: ${p.publication}
  - Target length: ${WORD_COUNTS[p.type]}
  - Placement-specific request: ${p.brief || "None provided; rely on campaign messaging"}
  ${p.scheduledDate ? `- Scheduled: ${p.scheduledDate}` : ""}`
    )
    .join("\n\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
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

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Extract JSON from the response (handle potential markdown code blocks)
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("Failed to parse AI response as JSON array");
  }

  const parsed = JSON.parse(jsonMatch[0]) as GeneratedCopy[];
  return parsed;
}
