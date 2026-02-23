import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const campaignId = formData.get("campaignId") as string | null;
    const placementId = formData.get("placementId") as string | null;
    const field = formData.get("field") as string | null; // "logoUrl" | "imageUrl"

    if (!file || !campaignId || !placementId || !field) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (field !== "logoUrl" && field !== "imageUrl") {
      return NextResponse.json(
        { error: "field must be logoUrl or imageUrl" },
        { status: 400 }
      );
    }

    const pathname = `placements/${campaignId}/${placementId}/${field}-${Date.now()}-${file.name}`;
    const blob = await put(pathname, file, { access: "public" });

    await db
      .update(schema.placements)
      .set({ [field]: blob.url })
      .where(
        and(
          eq(schema.placements.id, placementId),
          eq(schema.placements.campaignId, campaignId)
        )
      );

    return NextResponse.json({ url: blob.url });
  } catch (err: unknown) {
    console.error("Upload placement asset error:", err);
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
