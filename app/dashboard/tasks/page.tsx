import { Metadata } from "next";
import Link from "next/link";
import { getAllCampaignsWithClients, getSetting } from "@/lib/db";
import { DashboardTaskList } from "@/components/DashboardTaskList";
import { parseDismissedTaskIds } from "@/lib/dashboard-task-dismissals";
import { buildDashboardTasks } from "@/lib/dashboard-tasks";
import { DISMISSED_TASKS_SETTING_KEY } from "@/lib/dashboard-task-dismissals";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tasks — Peak Client Portal",
};

export default async function DashboardTasksPage() {
  const data = await getAllCampaignsWithClients();
  const dismissedRaw = await getSetting(DISMISSED_TASKS_SETTING_KEY);
  const dismissedTaskIds = parseDismissedTaskIds(dismissedRaw);
  const tasks = buildDashboardTasks(data, dismissedTaskIds);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-4 flex items-center gap-2">
        <Link
          href="/dashboard"
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Overview
        </Link>
        <span className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white">
          Tasks
        </span>
      </div>

      <DashboardTaskList tasks={tasks} title="All Team Tasks" />
    </div>
  );
}
