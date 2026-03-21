import { NextRequest, NextResponse } from "next/server";
import { getCapacityForDateRange } from "@/lib/db";

const MAX_SCHEDULE_CAPACITY_RANGE_DAYS = 366;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "startDate and endDate query params are required" },
      { status: 400 }
    );
  }

  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
    return NextResponse.json(
      { error: "Dates must be in YYYY-MM-DD format" },
      { status: 400 }
    );
  }

  if (startDate > endDate) {
    return NextResponse.json(
      { error: "startDate must be before or equal to endDate" },
      { status: 400 }
    );
  }

  // Keep the API permissive enough for admin scheduling up to a year out.
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  const diffDays = Math.round(
    (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays > MAX_SCHEDULE_CAPACITY_RANGE_DAYS) {
    return NextResponse.json(
      { error: `Date range cannot exceed ${MAX_SCHEDULE_CAPACITY_RANGE_DAYS} days` },
      { status: 400 }
    );
  }

  const capacity = await getCapacityForDateRange(startDate, endDate);
  return NextResponse.json(capacity);
}
