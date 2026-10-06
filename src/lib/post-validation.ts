import { db } from "@/lib/db";
import { accountTierFor } from "@/lib/platform-rules";
import { getRuleSet } from "@/lib/platform-rules-db";
import { checkChannels, PREFLIGHT_PREFIX, type PostCheck } from "@/lib/post-checks";
import { supportsFirstComment, validateChannel, type MediaInput } from "@/lib/social/capabilities";

export type LoadedPostCheck = PostCheck & {
  workspaceId: string;
  validatedAt: string;
  channelBodies: { channelId: string; name: string; body: string }[];
};

/**
 * Server-authoritative validation of a stored post against the live rule set
 * (code defaults + admin overrides) and each channel's real account tier.
 *
 * Reads only the columns validation needs: this runs on every schedule, queue,
 * publish-now and once more in the worker, so its footprint multiplies.
 */
export async function validateStoredPost(postId: string): Promise<LoadedPostCheck> {
  const [post, rules] = await Promise.all([
    db.post.findUniqueOrThrow({
      where: { id: postId },
      select: {
        workspaceId: true,
        firstComment: true,
        channels: {
          select: {
            channelId: true,
            platform: true,
            contentType: true,
            body: true,
            metadata: true,
            channel: { select: { name: true, socialAccount: { select: { metadata: true } } } },
          },
        },
        media: {
          orderBy: { order: "asc" },
          select: { media: { select: { kind: true, mimeType: true, width: true, height: true, durationSec: true } } },
        },
      },
    }),
    getRuleSet(),
  ]);

  const check = checkChannels({
    rules,
    firstComment: post.firstComment,
    media: post.media.map((m) => ({
      kind: m.media.kind,
      mimeType: m.media.mimeType,
      width: m.media.width,
      height: m.media.height,
      durationSec: m.media.durationSec,
    })),
    channels: post.channels.map((c) => ({
      channelId: c.channelId,
      name: c.channel?.name ?? c.platform,
      platform: c.platform,
      contentType: c.contentType,
      body: c.body,
      metadata: c.metadata,
      tier: accountTierFor(c.platform, c.channel?.socialAccount?.metadata),
    })),
  });

  return {
    ...check,
    workspaceId: post.workspaceId,
    validatedAt: new Date().toISOString(),
    channelBodies: post.channels.map((c) => ({ channelId: c.channelId, name: c.channel?.name ?? c.platform, body: c.body })),
  };
}

/**
 * Last gate before a platform API call: validates the exact text about to be
 * sent (UTM already applied) against the live rules and this account's tier.
 * Returns blocking messages (empty = clear to send). The worker calls this so a
 * scheduled post made valid yesterday is re-checked against today's rules.
 */
export async function preflightChannel(args: {
  platform: string;
  contentType: string;
  body: string;
  metadata?: string | null;
  media: MediaInput[];
  firstComment?: string | null;
  accountMetadata?: string | null;
}): Promise<string[]> {
  const rules = await getRuleSet();
  const r = validateChannel(
    args.platform,
    args.contentType,
    { body: args.body, media: args.media, metadata: args.metadata ?? undefined },
    {
      rules,
      firstComment: supportsFirstComment(args.platform) ? args.firstComment : null,
      context: { tier: accountTierFor(args.platform, args.accountMetadata) },
    },
  );
  return r.errors.length ? [`${PREFLIGHT_PREFIX}${r.errors.join(" ")}`] : [];
}
