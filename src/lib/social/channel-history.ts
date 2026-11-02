import { db } from "@/lib/db";

/**
 * Call just before deleting channels (disconnecting an account, or removing a Google Business location).
 *
 * Deleting a channel used to delete every post's channel row with it: the published text, the link and the stats vanished and
 * the post showed as "Untitled, no channels". The database now only empties the channel link on those rows (see the
 * `keep_published_history_on_disconnect` migration). This records "@handle" on them first, so history still says where the
 * post went, and removes what has no history to keep: a draft, failed or skipped post aimed at a channel that is gone would
 * otherwise be left with nowhere to go.
 *
 * Safe to run twice or to stop halfway: it only labels and removes unpublished rows, in that order.
 */
export async function keepPublishedHistory(channels: { id: string; handle: string }[]): Promise<void> {
  if (channels.length === 0) return;
  for (const c of channels) {
    await db.postChannel.updateMany({ where: { channelId: c.id, status: "published" }, data: { channelLabel: c.handle } });
  }
  await db.postChannel.deleteMany({ where: { channelId: { in: channels.map((c) => c.id) }, status: { not: "published" } } });
}
