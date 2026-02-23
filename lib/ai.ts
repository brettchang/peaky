import Anthropic from "@anthropic-ai/sdk";
import type { PlacementType } from "./types";
import { getSetting } from "./db";

const anthropic = new Anthropic();

export const AI_COPY_PROMPT_KEY = "ai_copy_prompt";

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

export const DEFAULT_AI_COPY_PROMPT = `You are a copywriter for The Peak, a daily business newsletter. You write ad copy that fits seamlessly into the newsletter's editorial voice — smart, concise, and conversational. The tone is professional but not stiff, informative but engaging.

Format guidelines by placement type:
- Primary: The main sponsored section. 150-200 words. Opens with a compelling hook, explains the value proposition, and ends with a clear call-to-action. Use markdown formatting (bold for key phrases, line breaks between paragraphs).
- Secondary: A shorter sponsored mention. 80-120 words. More concise, still engaging. One strong hook + value prop + CTA.
- Peak Picks: A brief product/service recommendation. 40-60 words. Feels like an editorial pick, not an ad. Punchy and direct.
- Beehiv: Newsletter cross-promotion. 100-150 words. Highlights what makes the newsletter worth subscribing to.
- Smart Links: Very brief inline mention. 30-50 words. Conversational, fits within newsletter flow.
- BLS: Bottom-of-letter sponsor. 80-120 words. Similar to secondary but positioned at the end.
- Podcast Ad: Audio ad script. 60-90 words. Conversational, designed to be read aloud naturally.

Always write in markdown format. Do not include the placement type as a heading.`;

export async function generateCopyForPlacements(input: {
  campaignName: string;
  clientName: string;
  messaging: string;
  desiredAction: string;
  placements: PlacementInput[];
}): Promise<GeneratedCopy[]> {
  const systemPrompt = await getSetting(AI_COPY_PROMPT_KEY) || DEFAULT_AI_COPY_PROMPT;

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
        content: `Write ad copy for the following campaign:

Campaign: ${input.campaignName}
Client: ${input.clientName}
Overall messaging: ${input.messaging}
Desired reader action: ${input.desiredAction}

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
