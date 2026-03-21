import type { Metadata } from "next";
import Link from "next/link";
import { AiPromptEditor } from "@/components/AiPromptEditor";
import { getSetting } from "@/lib/db";
import {
  AI_CAMPAIGN_EMAIL_SUMMARY_PROMPT_KEY,
  AI_CAMPAIGN_EMAIL_SUMMARY_TEMPLATE_VARIABLES,
  AI_COPY_PROMPT_KEY,
  AI_COPY_TEMPLATE_VARIABLES,
  AI_PODCAST_SCRIPT_PROMPT_KEY,
  AI_PODCAST_SCRIPT_TEMPLATE_VARIABLES,
  DEFAULT_AI_CAMPAIGN_EMAIL_SUMMARY_PROMPT,
  DEFAULT_AI_COPY_PROMPT,
  DEFAULT_AI_PODCAST_SCRIPT_PROMPT,
} from "@/lib/ai-constants";
import {
  DEFAULT_EMAIL_AGENT_POLICY_PROMPT,
  EMAIL_AGENT_POLICY_PROMPT_KEY,
} from "@/lib/email/constants";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Prompts — Peak Client Portal",
};

export default async function PromptSettingsPage() {
  const [
    currentCopyPrompt,
    currentPodcastScriptPrompt,
    currentCampaignEmailSummaryPrompt,
    currentEmailAgentPolicyPrompt,
  ] = await Promise.all([
    getSetting(AI_COPY_PROMPT_KEY),
    getSetting(AI_PODCAST_SCRIPT_PROMPT_KEY),
    getSetting(AI_CAMPAIGN_EMAIL_SUMMARY_PROMPT_KEY),
    getSetting(EMAIL_AGENT_POLICY_PROMPT_KEY),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Prompt Settings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Centralized prompt management for all AI-generated workflows.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Back to Dashboard
        </Link>
      </div>

      <div className="space-y-4">
        <AiPromptEditor
          title="AI Copy Prompt"
          promptKey={AI_COPY_PROMPT_KEY}
          defaultPrompt={DEFAULT_AI_COPY_PROMPT}
          templateVariables={AI_COPY_TEMPLATE_VARIABLES}
          currentPrompt={currentCopyPrompt}
        />
        <AiPromptEditor
          title="AI Podcast Script Prompt"
          promptKey={AI_PODCAST_SCRIPT_PROMPT_KEY}
          defaultPrompt={DEFAULT_AI_PODCAST_SCRIPT_PROMPT}
          templateVariables={AI_PODCAST_SCRIPT_TEMPLATE_VARIABLES}
          currentPrompt={currentPodcastScriptPrompt}
          summary="This prompt is used for :30 Pre-Roll and :30 Mid-Roll script generation for Peak Daily Podcast."
        />
        <AiPromptEditor
          title="AI Campaign Email Summary Prompt"
          promptKey={AI_CAMPAIGN_EMAIL_SUMMARY_PROMPT_KEY}
          defaultPrompt={DEFAULT_AI_CAMPAIGN_EMAIL_SUMMARY_PROMPT}
          templateVariables={AI_CAMPAIGN_EMAIL_SUMMARY_TEMPLATE_VARIABLES}
          currentPrompt={currentCampaignEmailSummaryPrompt}
          summary="This prompt is used by the daily campaign email summary monitor when combining inbox activity with campaign operational facts."
        />
        <AiPromptEditor
          title="AI Email Agent Policy Prompt"
          promptKey={EMAIL_AGENT_POLICY_PROMPT_KEY}
          defaultPrompt={DEFAULT_EMAIL_AGENT_POLICY_PROMPT}
          templateVariables={[]}
          currentPrompt={currentEmailAgentPolicyPrompt}
          summary="This prompt governs the inbox drafting agent used for human-reviewed client replies."
        />
      </div>
    </div>
  );
}
