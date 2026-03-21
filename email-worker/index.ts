import "dotenv/config";
import { syncMailboxThreads } from "@/lib/email/service";

const INTERVAL_MS = Number(process.env.EMAIL_WORKER_INTERVAL_MS || "300000");

async function runOnce() {
  const threads = await syncMailboxThreads({ threadLimit: 100 });
  console.log(
    `[email-worker] synced ${threads.length} thread${threads.length === 1 ? "" : "s"} at ${new Date().toISOString()}`
  );
}

async function main() {
  await runOnce();
  setInterval(() => {
    runOnce().catch((error) => {
      console.error("[email-worker] sync failed", error);
    });
  }, INTERVAL_MS);
}

main().catch((error) => {
  console.error("[email-worker] fatal error", error);
  process.exit(1);
});
