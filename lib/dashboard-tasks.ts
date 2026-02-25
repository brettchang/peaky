import { getAllCampaignsWithClients } from "@/lib/db";
import type { DashboardTask } from "@/components/DashboardTaskList";

export function buildDashboardTasks(
  data: Awaited<ReturnType<typeof getAllCampaignsWithClients>>
): DashboardTask[] {
  const today = new Date();
  const todayKey = toDateKey(today);
  const tasks: DashboardTask[] = [];

  for (const { campaign, clientName } of data) {
    const roundCompleteById = new Map(
      campaign.onboardingRounds.map((round) => [round.id, round.complete])
    );

    for (const placement of campaign.placements) {
      if (
        placement.status === "Copywriting in Progress" &&
        placement.copyVersion > 0 &&
        placement.currentCopy.trim()
      ) {
        tasks.push({
          id: `copy-${placement.id}`,
          campaignId: campaign.id,
          campaignName: campaign.name,
          clientName,
          type: "copy-review",
          title: `Peak team review needed: ${placement.type}`,
          detail: placement.scheduledDate
            ? `Placement is scheduled ${formatDateLong(placement.scheduledDate)}.`
            : "Placement date not scheduled yet.",
          href: `/dashboard/${campaign.id}/${placement.id}`,
          actionLabel: "Review Copy",
        });
      }

      if (!placement.scheduledDate) continue;
      const daysUntil = daysFromToday(todayKey, placement.scheduledDate);
      if (daysUntil < 0 || daysUntil > 7) continue;

      const roundComplete = placement.onboardingRoundId
        ? (roundCompleteById.get(placement.onboardingRoundId) ?? false)
        : false;

      if (!roundComplete) {
        tasks.push({
          id: `onboarding-${placement.id}`,
          campaignId: campaign.id,
          campaignName: campaign.name,
          clientName,
          type: "onboarding-reminder",
          title: "Email client: onboarding incomplete",
          detail: `${placement.type} runs ${formatDateLong(
            placement.scheduledDate
          )} (${daysUntil === 0 ? "today" : `in ${daysUntil} day${daysUntil !== 1 ? "s" : ""}`}).`,
          href: `/dashboard/${campaign.id}`,
          actionLabel: "Open Campaign",
          urgent: daysUntil <= 2,
        });
      }
    }

    if (campaign.billingOnboarding?.complete) {
      tasks.push({
        id: `billing-${campaign.id}`,
        campaignId: campaign.id,
        campaignName: campaign.name,
        clientName,
        type: "billing-invoice",
        title: "Invoice needed",
        detail: "Client completed the billing onboarding form.",
        href: `/dashboard/${campaign.id}`,
        actionLabel: "Open Invoicing",
      });
    }
  }

  return tasks.sort((a, b) => {
    if (a.urgent && !b.urgent) return -1;
    if (!a.urgent && b.urgent) return 1;

    const priority: Record<DashboardTask["type"], number> = {
      "onboarding-reminder": 1,
      "copy-review": 2,
      "billing-invoice": 3,
    };
    return priority[a.type] - priority[b.type];
  });
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysFromToday(todayKey: string, dateStr: string): number {
  const today = new Date(todayKey + "T00:00:00");
  const target = new Date(dateStr + "T00:00:00");
  return Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
}

function formatDateLong(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
