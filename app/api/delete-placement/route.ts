import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { deletePlacement } from "@/lib/db";
import {
  DASHBOARD_COOKIE_NAME,
  isDashboardAuthenticated,
} from "@/lib/dashboard-auth";

export async function POST(request: NextRequest) {
  const cookieStore = cookies();
  const cookie = cookieStore.get(DASHBOARD_COOKIE_NAME);
  if (!(await isDashboardAuthenticated(cookie?.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { campaignId, placementId } = body;

  if (!campaignId || !placementId) {
    return NextResponse.json(
      { error: "campaignId and placementId are required" },
      { status: 400 }
    );
  }

  const deleted = await deletePlacement(campaignId, placementId);
  if (!deleted) {
    return NextResponse.json({ error: "Placement not found" }, { status: 404 });
  }

  revalidatePath("/dashboard", "layout");
  return NextResponse.json({ success: true });
}
