import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { getThreadById, replaceThreadLinks } from "@/lib/email/db";
import type { EmailThreadLinkInput } from "@/lib/email/types";

export async function POST(
  request: NextRequest,
  { params }: { params: { threadId: string } }
) {
  try {
    const body = (await request.json()) as {
      links?: EmailThreadLinkInput[];
      campaignId?: string;
    };
    const links =
      body.links ??
      (body.campaignId
        ? [
            {
              campaignId: body.campaignId,
              confidence: 100,
              isPrimary: true,
              matchReason: "Manually linked by portal operator.",
              source: "manual" as const,
            },
          ]
        : []);
    await replaceThreadLinks(params.threadId, links);
    const thread = await getThreadById(params.threadId);
    revalidatePath("/dashboard");
    return NextResponse.json({ thread });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update campaign links" },
      { status: 500 }
    );
  }
}
