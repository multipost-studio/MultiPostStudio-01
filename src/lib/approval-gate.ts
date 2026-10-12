import { db } from "@/lib/db";

/**
 * Mandatory approvals. When a workspace turns on Workspace.requireApproval, a post may only be scheduled, queued or
 * published once an approval request for its CURRENT content has been approved. With the setting off (the default) none
 * of this runs and approvals stay optional.
 */

type Channel = { platform: string; body: string };
type LatestRequest = { status: string; approvedSnapshot: string | null } | null;

/** Order-independent fingerprint of what a post says on each platform. */
export function contentFingerprint(channels: Channel[]): string {
  return JSON.stringify(channels.map((c) => `${c.platform}\u0000${c.body}`).sort());
}

function snapshotFingerprint(snapshot: string | null): string | null {
  if (!snapshot) return null;
  try {
    const parsed = JSON.parse(snapshot) as { channels?: Channel[] };
    return Array.isArray(parsed.channels) ? contentFingerprint(parsed.channels) : null;
  } catch {
    return null;
  }
}

export const APPROVAL_REQUIRED_PREFIX = "This workspace requires approval before publishing.";

/**
 * Why a post may not go out yet, or null when it may. Pure: pass the workspace setting, the post's most recent approval
 * request and its current channel text.
 */
export function evaluateApproval(args: { requireApproval: boolean; latest: LatestRequest; channels: Channel[] }): string | null {
  if (!args.requireApproval) return null;
  const { latest } = args;
  if (!latest) return `${APPROVAL_REQUIRED_PREFIX} Send this post for approval from the composer first.`;
  switch (latest.status) {
    case "approved": {
      const approved = snapshotFingerprint(latest.approvedSnapshot);
      // A snapshot is written at final approval. Rows from before that existed have none: trust the status.
      if (approved !== null && approved !== contentFingerprint(args.channels)) {
        return `${APPROVAL_REQUIRED_PREFIX} This post was edited after it was approved. Send it for approval again.`;
      }
      return null;
    }
    case "in_review":
      return `${APPROVAL_REQUIRED_PREFIX} This post is still waiting for approval.`;
    case "changes_requested":
      return `${APPROVAL_REQUIRED_PREFIX} Changes were requested on this post. Update it and resubmit.`;
    default:
      return `${APPROVAL_REQUIRED_PREFIX} The last approval for this post was rejected or reset. Send it for approval again.`;
  }
}

/**
 * Database wrapper. Pass what the caller already loaded (the queue has the post and workspace in hand) to skip queries;
 * with the setting off this costs one small read, or none when the caller supplies it.
 */
export async function approvalBlockReason(
  postId: string,
  known: { requireApproval?: boolean; channels?: Channel[] } = {},
): Promise<string | null> {
  let requireApproval = known.requireApproval;
  let channels = known.channels;
  if (requireApproval === undefined || channels === undefined) {
    const post = await db.post.findUnique({
      where: { id: postId },
      select: { workspace: { select: { requireApproval: true } }, channels: { select: { platform: true, body: true } } },
    });
    if (!post) return null;
    requireApproval ??= post.workspace.requireApproval;
    channels ??= post.channels;
  }
  if (!requireApproval) return null;
  const [latest] = await db.approvalRequest.findMany({
    where: { postId },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { status: true, approvedSnapshot: true },
  });
  return evaluateApproval({ requireApproval: true, latest: latest ?? null, channels });
}
