import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSetting, upsertSetting } from "@/lib/db";
import {
  DISMISSED_TASKS_SETTING_KEY,
  parseDismissedTaskIds,
  serializeDismissedTaskIds,
} from "@/lib/dashboard-task-dismissals";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const taskId =
    typeof body?.taskId === "string" ? body.taskId.trim() : "";

  if (!taskId) {
    return NextResponse.json({ error: "taskId is required" }, { status: 400 });
  }

  const current = parseDismissedTaskIds(
    await getSetting(DISMISSED_TASKS_SETTING_KEY)
  );
  current.add(taskId);

  await upsertSetting(
    DISMISSED_TASKS_SETTING_KEY,
    serializeDismissedTaskIds(current)
  );

  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/tasks");
  return NextResponse.json({ success: true });
}
