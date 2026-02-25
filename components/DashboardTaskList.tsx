"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export interface DashboardTask {
  id: string;
  campaignId: string;
  campaignName: string;
  clientName: string;
  type:
    | "copy-review"
    | "onboarding-reminder"
    | "client-suggestion-review"
    | "billing-invoice";
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
  urgent?: boolean;
}

export function DashboardTaskList({
  tasks,
  title = "Task List",
}: {
  tasks: DashboardTask[];
  title?: string;
}) {
  const router = useRouter();
  const [hiddenTaskIds, setHiddenTaskIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState<Record<string, boolean>>({});

  const visibleTasks = useMemo(
    () => tasks.filter((task) => !hiddenTaskIds.has(task.id)),
    [tasks, hiddenTaskIds]
  );

  const tasksByCampaign = visibleTasks.reduce<
    Array<{
      key: string;
      campaignId: string;
      campaignName: string;
      clientName: string;
      tasks: DashboardTask[];
    }>
  >((groups, task) => {
    const key = `${task.campaignId}:${task.clientName}:${task.campaignName}`;
    const existing = groups.find((group) => group.key === key);
    if (existing) {
      existing.tasks.push(task);
      return groups;
    }
    groups.push({
      key,
      campaignId: task.campaignId,
      campaignName: task.campaignName,
      clientName: task.clientName,
      tasks: [task],
    });
    return groups;
  }, []);

  async function handleDeleteTask(taskId: string) {
    setHiddenTaskIds((prev) => {
      const next = new Set(prev);
      next.add(taskId);
      return next;
    });
    setIsDeleting((prev) => ({ ...prev, [taskId]: true }));

    try {
      const response = await fetch("/api/dashboard/tasks/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
      if (!response.ok) {
        throw new Error("Failed to delete task");
      }
      router.refresh();
    } catch {
      setHiddenTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    } finally {
      setIsDeleting((prev) => ({ ...prev, [taskId]: false }));
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <span className="text-xs text-gray-500">
          {visibleTasks.length} open task{visibleTasks.length !== 1 && "s"}
        </span>
      </div>

      {visibleTasks.length === 0 ? (
        <p className="text-sm text-gray-500">No urgent actions right now.</p>
      ) : (
        <div className="space-y-2">
          {tasksByCampaign.map((group) => (
            <div key={group.key} className="rounded-md border border-gray-200 bg-gray-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">
                  {group.clientName} · {group.campaignName}
                </p>
                <span className="text-xs text-gray-500">
                  {group.tasks.length} task{group.tasks.length !== 1 && "s"}
                </span>
              </div>
              <div className="space-y-2">
                {group.tasks.map((task) => (
                  <div
                    key={task.id}
                    className={`rounded-md border px-3 py-3 ${taskCardClass(task)}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${taskBadgeClass(task)}`}>
                          {taskLabel(task.type)}
                        </span>
                        <p className="text-sm font-medium text-gray-900">{task.title}</p>
                        <p className="mt-1 text-xs text-gray-600">{task.detail}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Link
                          href={task.href}
                          className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
                        >
                          {task.actionLabel}
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDeleteTask(task.id)}
                          disabled={Boolean(isDeleting[task.id])}
                          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function taskLabel(type: DashboardTask["type"]): string {
  switch (type) {
    case "copy-review":
      return "Copy Review";
    case "billing-invoice":
      return "Invoicing";
    case "client-suggestion-review":
      return "Client Feedback";
    case "onboarding-reminder":
      return "Onboarding";
    default:
      return "Task";
  }
}

function taskCardClass(task: DashboardTask): string {
  if (task.urgent) return "border-red-200 bg-red-50";
  switch (task.type) {
    case "copy-review":
      return "border-blue-200 bg-blue-50";
    case "billing-invoice":
      return "border-emerald-200 bg-emerald-50";
    case "client-suggestion-review":
      return "border-fuchsia-200 bg-fuchsia-50";
    case "onboarding-reminder":
      return "border-amber-200 bg-amber-50";
    default:
      return "border-gray-200 bg-gray-50";
  }
}

function taskBadgeClass(task: DashboardTask): string {
  if (task.urgent) return "bg-red-100 text-red-700";
  switch (task.type) {
    case "copy-review":
      return "bg-blue-100 text-blue-700";
    case "billing-invoice":
      return "bg-emerald-100 text-emerald-700";
    case "client-suggestion-review":
      return "bg-fuchsia-100 text-fuchsia-700";
    case "onboarding-reminder":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}
