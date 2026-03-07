import Anthropic from "@anthropic-ai/sdk";
import { getCampaignById, getCapacityForDateRange, getAllCampaignsWithClients } from "../lib/db";
import { buildCampaignContext, buildCapacityContext, loadKnowledgeBase } from "./context";
import type { CampaignMatch, EmailThread } from "./types";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

const anthropic = new Anthropic();

const tools: Anthropic.Tool[] = [
  {
    name: "check_capacity",
    description:
      "Check scheduling capacity for a date range. Returns available slots per placement type per publication per day.",
    input_schema: {
      type: "object" as const,
      properties: {
        start_date: {
          type: "string",
          description: "Start date in YYYY-MM-DD format",
        },
        end_date: {
          type: "string",
          description: "End date in YYYY-MM-DD format",
        },
      },
      required: ["start_date", "end_date"],
    },
  },
  {
    name: "lookup_campaign",
    description:
      "Look up detailed information about a specific campaign by ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaign_id: {
          type: "string",
          description: "The campaign ID to look up",
        },
      },
      required: ["campaign_id"],
    },
  },
  {
    name: "list_campaigns_for_client",
    description:
      "List all campaigns associated with a client email address.",
    input_schema: {
      type: "object" as const,
      properties: {
        client_email: {
          type: "string",
          description: "The client email address to search for",
        },
      },
      required: ["client_email"],
    },
  },
];

async function handleToolCall(
  name: string,
  input: Record<string, string>
): Promise<string> {
  switch (name) {
    case "check_capacity": {
      return buildCapacityContext(input.start_date, input.end_date);
    }
    case "lookup_campaign": {
      const campaign = await getCampaignById(input.campaign_id);
      if (!campaign) return `Campaign ${input.campaign_id} not found.`;
      return JSON.stringify(campaign, null, 2);
    }
    case "list_campaigns_for_client": {
      const { matchSenderToCampaigns } = await import("./match");
      const allCampaigns = await getAllCampaignsWithClients();
      const matches = matchSenderToCampaigns(input.client_email, allCampaigns);
      if (matches.length === 0) {
        return `No campaigns found for ${input.client_email}.`;
      }
      return matches
        .map(
          (m) =>
            `${m.campaign.name} (ID: ${m.campaign.id}) — ${m.campaign.status}, Client: ${m.clientName}`
        )
        .join("\n");
    }
    default:
      return `Unknown tool: ${name}`;
  }
}

export async function generateDraftReply(input: {
  thread: EmailThread;
  matchedCampaigns: CampaignMatch[];
}): Promise<{ subject: string; body: string }> {
  const model = process.env.EMAIL_AGENT_MODEL?.trim() || DEFAULT_MODEL;
  const knowledgeBase = await loadKnowledgeBase();

  // Build campaign context for matched campaigns
  const campaignContextParts = input.matchedCampaigns.map(buildCampaignContext);
  const campaignContext =
    campaignContextParts.length > 0
      ? `\n\n# Matched Campaign Context\n\n${campaignContextParts.join("\n\n---\n\n")}`
      : "\n\n# No Campaign Match\nThe sender was not matched to any campaign in our system. Provide a general, helpful response based on the knowledge base.";

  const systemPrompt = `You are an email assistant for The Peak Media Co.'s ad operations team. You draft professional, helpful replies to client emails about advertising campaigns.

# Knowledge Base
${knowledgeBase}
${campaignContext}

# Operating Rules
1. Draft a reply that directly addresses the client's questions or requests.
2. Be specific — use campaign data, placement details, and dates when available.
3. If asked about scheduling availability, use the check_capacity tool to look up real data.
4. If you need more campaign details, use the lookup_campaign tool.
5. Never make up dates, prices, or metrics — use tools to look up real data or say you'll confirm.
6. Keep replies concise and professional. Match the tone of the incoming email.
7. Sign off as "The Peak Ad Ops Team" (not as a specific person).
8. Format the reply as clean HTML suitable for email (use <p>, <br>, <ul>/<li> tags, no <html>/<body> wrapper).
9. Return your final answer as JSON: {"subject": "...", "body": "..."}

# Important
- The "body" field should contain the HTML reply body only (no greeting salutation prefix like "Hi [Name]," — that will be added automatically if needed).
- Actually, DO include a greeting like "Hi [Name]," using the sender's name from the email thread.
- The "subject" field should be a natural reply subject line.`;

  // Format email thread for the user message
  const threadMessages = input.thread.messages
    .map((msg) => {
      const dateStr = msg.date.toISOString().slice(0, 16).replace("T", " ");
      return `From: ${msg.from}\nDate: ${dateStr}\nSubject: ${msg.subject}\n\n${msg.bodyText || msg.snippet}`;
    })
    .join("\n\n---\n\n");

  const userMessage = `Please draft a reply to this email thread:\n\n${threadMessages}`;

  // Run the Claude messages loop with tool use
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  const MAX_TOOL_ROUNDS = 5;
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      tools,
      messages,
    });

    // Check if we got a final text response
    if (response.stop_reason === "end_turn") {
      const textBlock = response.content.find((b) => b.type === "text");
      if (textBlock && textBlock.type === "text") {
        return parseAgentResponse(textBlock.text);
      }
    }

    // Handle tool use
    const toolUseBlocks = response.content.filter(
      (b) => b.type === "tool_use"
    );
    if (toolUseBlocks.length === 0) {
      // No tools and no end_turn — extract whatever text we have
      const textBlock = response.content.find((b) => b.type === "text");
      if (textBlock && textBlock.type === "text") {
        return parseAgentResponse(textBlock.text);
      }
      break;
    }

    // Add assistant message with tool use
    messages.push({ role: "assistant", content: response.content });

    // Execute tools and add results
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      if (block.type !== "tool_use") continue;
      const result = await handleToolCall(
        block.name,
        block.input as Record<string, string>
      );
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result,
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  // Fallback if we exhausted tool rounds
  return {
    subject: `Re: ${input.thread.messages[0]?.subject || "Your inquiry"}`,
    body: "<p>Thank you for your email. Our ad ops team will review and get back to you shortly.</p><p>Best,<br>The Peak Ad Ops Team</p>",
  };
}

function parseAgentResponse(text: string): {
  subject: string;
  body: string;
} {
  // Try to extract JSON from the response
  const jsonMatch = text.match(/\{[\s\S]*"subject"[\s\S]*"body"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (typeof parsed.subject === "string" && typeof parsed.body === "string") {
        return { subject: parsed.subject, body: parsed.body };
      }
    } catch {
      // Fall through to text extraction
    }
  }

  // Try code fence
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) {
    try {
      const parsed = JSON.parse(fenced[1].trim());
      if (typeof parsed.subject === "string" && typeof parsed.body === "string") {
        return { subject: parsed.subject, body: parsed.body };
      }
    } catch {
      // Fall through
    }
  }

  // Last resort: use the text as the body
  return {
    subject: "Re: Your inquiry",
    body: `<p>${text.replace(/\n/g, "<br>")}</p>`,
  };
}
