import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getPlacement, syncPlacementBeehiivStats } from "@/lib/db";
import {
  fetchPostById,
  findPostByLink,
  extractStats,
  normalizeUrl,
} from "@/lib/beehiiv";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { campaignId, placementId } = body;

  if (!campaignId || !placementId) {
    return NextResponse.json(
      { error: "campaignId and placementId are required" },
      { status: 400 }
    );
  }

  const placement = await getPlacement(campaignId, placementId);
  if (!placement) {
    return NextResponse.json(
      { error: "Placement not found" },
      { status: 404 }
    );
  }

  try {
    // Fast path: beehiivPostId already stored
    if (placement.beehiivPostId) {
      const post = await fetchPostById(placement.beehiivPostId);
      if (!post) {
        return NextResponse.json(
          { error: "Beehiiv post not found for stored ID" },
          { status: 404 }
        );
      }

      // Find the matching click entry if we have a link
      let clickEntry = null;
      if (placement.linkToPlacement && post.stats?.clicks) {
        const normalizedLink = normalizeUrl(placement.linkToPlacement);
        clickEntry =
          post.stats.clicks.find(
            (c) => normalizeUrl(c.base_url) === normalizedLink
          ) ?? null;
      }

      const stats = extractStats(post, clickEntry);
      await syncPlacementBeehiivStats(placementId, post.id, stats);

      revalidatePath("/dashboard", "layout");
      return NextResponse.json({ success: true, postId: post.id });
    }

    // Search path: need linkToPlacement to find the post
    if (!placement.linkToPlacement) {
      return NextResponse.json(
        {
          error:
            "No Beehiiv post ID or link to placement set. Add a link to placement first, or manually set the Beehiiv post ID.",
        },
        { status: 400 }
      );
    }

    const result = await findPostByLink(
      placement.linkToPlacement,
      placement.scheduledDate
    );

    if (!result) {
      return NextResponse.json(
        {
          error:
            "Could not find a Beehiiv post containing this placement link. Verify the link matches the URL in the newsletter.",
        },
        { status: 404 }
      );
    }

    // Re-fetch the post by ID to get full stats (list endpoint may omit opens/recipients)
    const fullPost = await fetchPostById(result.post.id);
    const post = fullPost ?? result.post;

    // Re-find the click entry in the full post's stats
    let clickEntry = result.clickEntry;
    if (fullPost?.stats?.clicks && placement.linkToPlacement) {
      const normalizedLink = normalizeUrl(placement.linkToPlacement);
      clickEntry =
        fullPost.stats.clicks.find(
          (c) => normalizeUrl(c.base_url) === normalizedLink
        ) ?? result.clickEntry;
    }

    const stats = extractStats(post, clickEntry);
    await syncPlacementBeehiivStats(placementId, post.id, stats);

    revalidatePath("/dashboard", "layout");
    return NextResponse.json({ success: true, postId: result.post.id });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error syncing stats";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
