import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { bulkSchedulePlacements } from "@/lib/db";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { assignments } = body;

  if (!Array.isArray(assignments) || assignments.length === 0) {
    return NextResponse.json(
      { error: "assignments array is required and must not be empty" },
      { status: 400 }
    );
  }

  // Validate each assignment
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  for (const a of assignments) {
    if (!a.campaignId || !a.placementId || !a.scheduledDate) {
      return NextResponse.json(
        { error: "Each assignment must have campaignId, placementId, and scheduledDate" },
        { status: 400 }
      );
    }
    if (!dateRegex.test(a.scheduledDate)) {
      return NextResponse.json(
        { error: `Invalid date format: ${a.scheduledDate}. Must be YYYY-MM-DD` },
        { status: 400 }
      );
    }
  }

  const result = await bulkSchedulePlacements(assignments);

  revalidatePath("/dashboard", "layout");
  return NextResponse.json(result);
}
