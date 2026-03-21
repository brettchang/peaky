import { getSetting, upsertSetting } from "@/lib/db";

export async function hasAlertBeenSent(key: string): Promise<boolean> {
  return (await getSetting(key)) === "1";
}

export async function markAlertSent(key: string): Promise<void> {
  await upsertSetting(key, "1");
}
