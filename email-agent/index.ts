import "dotenv/config";
import express from "express";
import {
  fetchUnreadThreads,
  getThreadDetail,
  parseThread,
  createReplyDraft,
  markThreadRead,
} from "./gmail";
import { isInternalEmail, matchSenderToCampaigns } from "./match";
import { generateDraftReply } from "./agent";
import { getSetting } from "../lib/db";
import { upsertSetting } from "../lib/db";
import { sendSlackNotification } from "./slack";
import { buildEmailDraftReadyNotification } from "./slack-events";
import { getAllCampaignsWithClientsForEmailAgent } from "./db";

const PORT = Number(process.env.PORT ?? 3001);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 300_000);
const MARK_READ = process.env.EMAIL_AGENT_MARK_READ !== "false";
const CREATE_DRAFTS = process.env.EMAIL_AGENT_CREATE_DRAFTS !== "false";
const PROCESSED_KEY_PREFIX = "email_agent_processed:";
const VALID_POLL_INTERVAL_MS =
  Number.isFinite(POLL_INTERVAL_MS) && POLL_INTERVAL_MS >= 30_000
    ? Math.floor(POLL_INTERVAL_MS)
    : 300_000;

function processedKey(messageId: string): string {
  return `${PROCESSED_KEY_PREFIX}${messageId}`;
}

async function isProcessed(messageId: string): Promise<boolean> {
  return (await getSetting(processedKey(messageId))) === "1";
}

async function markProcessed(messageId: string): Promise<void> {
  await upsertSetting(processedKey(messageId), "1");
}

async function pollOnce(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Polling for unread threads...`);

  let threadIds: string[];
  try {
    threadIds = await fetchUnreadThreads();
  } catch (error) {
    console.error("Failed to fetch unread threads:", error);
    return;
  }

  if (threadIds.length === 0) {
    console.log("No unread threads found.");
    return;
  }

  console.log(`Found ${threadIds.length} unread thread(s).`);

  let allCampaigns;
  try {
    allCampaigns = await getAllCampaignsWithClientsForEmailAgent();
  } catch (error) {
    console.error("Failed to fetch campaigns:", error);
    return;
  }

  for (const threadId of threadIds) {
    try {
      const rawThread = await getThreadDetail(threadId);
      const thread = parseThread(rawThread);

      if (thread.messages.length === 0) continue;

      // Check the latest message
      const latestMessage = thread.messages[thread.messages.length - 1];

      // Skip if already processed
      if (await isProcessed(latestMessage.id)) {
        console.log(`Thread ${threadId}: latest message ${latestMessage.id} already processed, skipping.`);
        continue;
      }

      // Skip if latest message is from an internal sender
      if (isInternalEmail(latestMessage.fromEmail)) {
        console.log(`Thread ${threadId}: latest message from internal sender, skipping.`);
        await markProcessed(latestMessage.id);
        continue;
      }

      console.log(`Processing thread ${threadId} from ${latestMessage.fromEmail}...`);

      // Match sender to campaigns
      const matchedCampaigns = matchSenderToCampaigns(
        latestMessage.fromEmail,
        allCampaigns
      );

      if (matchedCampaigns.length > 0) {
        console.log(`  Matched ${matchedCampaigns.length} campaign(s): ${matchedCampaigns.map((m) => m.campaign.name).join(", ")}`);
      } else {
        console.log(`  No campaign match for ${latestMessage.fromEmail}`);
      }

      // Generate draft reply
      const draftContent = await generateDraftReply({
        thread,
        matchedCampaigns,
      });

      // Create Gmail draft in the same thread (can be disabled in dry-run mode)
      let draftId: string | undefined;
      if (CREATE_DRAFTS) {
        draftId = await createReplyDraft(
          threadId,
          latestMessage.fromEmail,
          draftContent.subject,
          draftContent.body
        );
      }

      if (CREATE_DRAFTS) {
        console.log(`  Draft created${draftId ? ` (ID: ${draftId})` : ""}`);
      } else {
        console.log("  Draft creation skipped (EMAIL_AGENT_CREATE_DRAFTS=false).");
      }

      // Send Slack notification
      try {
        const notification = buildEmailDraftReadyNotification({
          threadId,
          senderEmail: latestMessage.fromEmail,
          senderName: latestMessage.from,
          subject: latestMessage.subject,
          matchedCampaignNames: matchedCampaigns.map((m) => m.campaign.name),
          snippet: (latestMessage.bodyText || latestMessage.snippet).slice(0, 200),
        });
        await sendSlackNotification(notification);
        console.log(`  Slack notification sent.`);
      } catch (error) {
        console.error(`  Failed to send Slack notification:`, error);
      }

      // Mark as processed
      await markProcessed(latestMessage.id);

      // Optionally mark thread as read
      if (MARK_READ) {
        await markThreadRead(threadId);
      }
    } catch (error) {
      console.error(`Error processing thread ${threadId}:`, error);
    }
  }
}

// ─── Express health check server ────────────────────────────

const app = express();
let startedAtIso = new Date().toISOString();
let lastPollStartedAtIso: string | null = null;
let lastPollFinishedAtIso: string | null = null;
let isPolling = false;
let successfulPolls = 0;
let failedPolls = 0;

app.get("/healthz", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "email-agent",
    startedAt: startedAtIso,
    isPolling,
    lastPollStartedAt: lastPollStartedAtIso,
    lastPollFinishedAt: lastPollFinishedAtIso,
    successfulPolls,
    failedPolls,
  });
});

// ─── Main entry point ────────────────────────────────────────

let shutdownRequested = false;

async function runPollCycle(): Promise<void> {
  if (isPolling) {
    console.log("Previous poll still running, skipping this interval.");
    return;
  }

  isPolling = true;
  lastPollStartedAtIso = new Date().toISOString();
  try {
    await pollOnce();
    successfulPolls += 1;
  } catch (error) {
    failedPolls += 1;
    throw error;
  } finally {
    lastPollFinishedAtIso = new Date().toISOString();
    isPolling = false;
  }
}

async function main() {
  app.listen(PORT, () => {
    console.log(`Email agent health check listening on port ${PORT}`);
  });

  startedAtIso = new Date().toISOString();
  console.log(
    `Email agent starting. Poll interval: ${VALID_POLL_INTERVAL_MS}ms, create drafts: ${CREATE_DRAFTS}, mark read: ${MARK_READ}`
  );

  // Run first poll immediately
  await runPollCycle();

  // Schedule recurring polls
  const interval = setInterval(async () => {
    if (shutdownRequested) return;
    try {
      await runPollCycle();
    } catch (error) {
      console.error("Unhandled error in poll loop:", error);
    }
  }, VALID_POLL_INTERVAL_MS);

  // Graceful shutdown
  const shutdown = () => {
    if (shutdownRequested) return;
    shutdownRequested = true;
    console.log("Shutting down email agent...");
    clearInterval(interval);
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  console.error("Fatal error starting email agent:", error);
  process.exit(1);
});
