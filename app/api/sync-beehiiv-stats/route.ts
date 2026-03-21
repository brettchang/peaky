import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCampaignById, getPlacement, syncPlacementBeehiivStats } from "@/lib/db";
import {
  doesPostMatchScheduledDate,
  findMatchingClickEntry,
  fetchPostById,
  findPostByLink,
  extractStats,
} from "@/lib/beehiiv";
import { sendSlackNotification } from "@/lib/slack";
import { getAppBaseUrl } from "@/lib/urls";
import {
  buildMetricsSnapshotHash,
  buildPlacementMetricsSyncedNotification,
} from "@/lib/slack-events";
import { hasAlertBeenSent, markAlertSent } from "@/lib/slack-alert-dedupe";

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
    const campaign = await getCampaignById(campaignId);
    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    const notifyMetricsSynced = async (
      beehiivPostId: string,
      stats: ReturnType<typeof extractStats>
    ) => {
      try {
        const hash = buildMetricsSnapshotHash({
          totalSends: stats.totalSends,
          totalOpens: stats.totalOpens,
          uniqueOpens: stats.uniqueOpens,
          openRate: stats.openRate,
          totalClicks: stats.totalClicks,
          uniqueClicks: stats.uniqueClicks,
        });
        const dedupeKey = `slack_alert:metrics_synced:${placement.id}:${beehiivPostId}:${hash}`;
        if (await hasAlertBeenSent(dedupeKey)) return;

        await sendSlackNotification(
          buildPlacementMetricsSyncedNotification({
            campaignId: campaign.id,
            campaignName: campaign.name,
            placementId: placement.id,
            placementName: placement.name,
            placementType: placement.type,
            publication: placement.publication,
            scheduledDate: placement.scheduledDate,
            beehiivPostId,
            stats,
            dashboardUrl: `${getAppBaseUrl()}/dashboard/${campaign.id}/${placement.id}`,
          })
        );
        await markAlertSent(dedupeKey);
      } catch (error) {
        console.error("Slack notification failed (placement.metrics.synced):", error);
      }
    };

    // Fast path: beehiivPostId already stored
    if (placement.beehiivPostId) {
      const storedPost = await fetchPostById(
        placement.beehiivPostId,
        placement.publication
      );

      if (storedPost) {
        let resolvedPost = storedPost;
        let clickEntry = null;
        const storedPostMatchesScheduledDate = doesPostMatchScheduledDate(
          storedPost,
          placement.scheduledDate
        );

        // Match the placement URL against clicks on the stored post.
        if (placement.linkToPlacement && storedPost.stats?.clicks) {
          clickEntry = findMatchingClickEntry(
            storedPost.stats.clicks,
            placement.linkToPlacement
          );
        }

        // If the stored post doesn't contain this link, or it belongs to the wrong
        // scheduled day for this placement, fall back to link discovery.
        if (
          placement.linkToPlacement &&
          (!clickEntry || !storedPostMatchesScheduledDate)
        ) {
          const result = await findPostByLink(
            placement.linkToPlacement,
            placement.scheduledDate,
            placement.publication
          );
          if (result) {
            const fullPost = await fetchPostById(
              result.post.id,
              placement.publication
            );
            resolvedPost = fullPost ?? result.post;

            clickEntry = result.clickEntry;
            if (fullPost?.stats?.clicks) {
              clickEntry =
                findMatchingClickEntry(
                  fullPost.stats.clicks,
                  placement.linkToPlacement
                ) ?? result.clickEntry;
            }
          }
        }

        const stats = extractStats(resolvedPost, clickEntry);
        await syncPlacementBeehiivStats(placementId, resolvedPost.id, stats);
        await notifyMetricsSynced(resolvedPost.id, stats);

        revalidatePath("/dashboard", "layout");
        return NextResponse.json({ success: true, postId: resolvedPost.id });
      }

      // Stored ID is stale/missing in Beehiiv; fall through to link-based search if available.
      if (!placement.linkToPlacement) {
        return NextResponse.json(
          { error: "Beehiiv post not found for stored ID" },
          { status: 404 }
        );
      }
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
      placement.scheduledDate,
      placement.publication
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
    const fullPost = await fetchPostById(result.post.id, placement.publication);
    const post = fullPost ?? result.post;

    // Re-find the click entry in the full post's stats
    let clickEntry = result.clickEntry;
    if (fullPost?.stats?.clicks && placement.linkToPlacement) {
      clickEntry =
        findMatchingClickEntry(
          fullPost.stats.clicks,
          placement.linkToPlacement
        ) ?? result.clickEntry;
    }

    const stats = extractStats(post, clickEntry);
    await syncPlacementBeehiivStats(placementId, post.id, stats);
    await notifyMetricsSynced(post.id, stats);

    revalidatePath("/dashboard", "layout");
    return NextResponse.json({ success: true, postId: result.post.id });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error syncing stats";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
