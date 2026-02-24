import Anthropic from "@anthropic-ai/sdk";
import type { PlacementType } from "./types";
import { getSetting } from "./db";
import { AI_COPY_PROMPT_KEY, DEFAULT_AI_COPY_PROMPT } from "./ai-constants";

const anthropic = new Anthropic();

export { AI_COPY_PROMPT_KEY, DEFAULT_AI_COPY_PROMPT };

interface PlacementInput {
  id: string;
  type: PlacementType;
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

  const systemPrompt = applyTemplateVariables(rawPrompt, {
    campaignName: input.campaignName,
    clientName: input.clientName,
    messaging: input.messaging,
    desiredAction: input.desiredAction,
  });

  const placementDescriptions = input.placements
    .map(
      (p, i) =>
        `Placement ${i + 1} (ID: ${p.id}):
  - Type: ${p.type}
  - Target length: ${WORD_COUNTS[p.type]}
  - Client brief: ${p.brief || "No specific brief provided"}
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
        content: `Write ad copy for the following placements:

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
