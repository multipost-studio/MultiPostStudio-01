"use server";

import { db } from "@/lib/db";
import { withPermission, ensureInWorkspace, fail, ok } from "./_helpers";
import { schedulePostAction } from "./posts";

/**
 * Reorder the Instagram grid planner: the caller sends the scheduled posts
 * in their new top-to-bottom order. The set of scheduled times doesn't
 * change — only which post gets which slot — so this reassigns each post to
 * the next-available time from the original (sorted) slot pool rather than
 * asking the user to pick new dates one by one.
 */
export async function reorderGridAction(orderedPostIds: string[]) {
  const ctx = await withPermission("content.publish");
  if (orderedPostIds.length < 2) return ok();

  for (const id of orderedPostIds) {
    await ensureInWorkspace("post", id, ctx.active.workspace.id);
  }

  const posts = await db.post.findMany({
    where: { id: { in: orderedPostIds }, status: "scheduled" },
    select: { id: true, scheduledAt: true },
  });
  if (posts.length !== orderedPostIds.length) return fail("One of these posts is no longer scheduled");

  // Slot pool: the same set of times, latest first — index 0 is the
  // "topmost" (soonest-to-be-newest) slot, matching the grid's display order.
  const slots = posts
    .map((p) => p.scheduledAt!)
    .sort((a, b) => b.getTime() - a.getTime());

  for (let i = 0; i < orderedPostIds.length; i++) {
    const postId = orderedPostIds[i];
    const current = posts.find((p) => p.id === postId)!;
    const target = slots[i];
    if (current.scheduledAt!.getTime() === target.getTime()) continue;
    const res = await schedulePostAction(postId, target.toISOString());
    if (!res.ok) return res;
  }

  return ok(undefined, "Grid reordered");
}
