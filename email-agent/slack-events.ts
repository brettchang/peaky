import type { SlackNotificationInput } from "./slack";

interface EmailDraftReadyInput {
  threadId: string;
  senderEmail: string;
  senderName: string;
  subject: string;
  matchedCampaignNames: string[];
  snippet: string;
}

export function buildEmailDraftReadyNotification(
  input: EmailDraftReadyInput
): SlackNotificationInput {
  const campaignInfo =
    input.matchedCampaignNames.length > 0
      ? input.matchedCampaignNames.join(", ")
      : "No campaign match";

  return {
    event: "email_agent.draft_ready",
    title: "Email draft ready for review",
    fields: [
      { label: "From", value: input.senderName || input.senderEmail },
      { label: "Subject", value: input.subject },
      { label: "Matched Campaigns", value: campaignInfo },
      { label: "Preview", value: input.snippet },
    ],
    linkLabel: "Open Gmail Drafts",
    linkUrl: "https://mail.google.com/mail/u/0/#drafts",
  };
}
