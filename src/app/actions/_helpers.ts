import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/session";
import { assertPermission, type Permission } from "@/lib/rbac";

export type ActionResult<T = undefined> = {
  ok: boolean;
  error?: string;
  message?: string;
  data?: T;
};

export const ok = <T>(data?: T, message?: string): ActionResult<T> => ({ ok: true, data, message });
export const fail = (error: string): ActionResult => ({ ok: false, error });

/** Load workspace context and assert a permission in one step. */
export async function withPermission(permission: Permission) {
  const ctx = await requireWorkspace();
  assertPermission(ctx.active.role, permission);
  return ctx;
}

/** Verify an entity belongs to the active workspace; throws otherwise. */
export async function ensureInWorkspace(
  model: "post" | "contentIdea" | "campaign" | "mediaAsset" | "conversation" | "automation" | "report",
  id: string,
  workspaceId: string,
) {
  // @ts-expect-error dynamic model access is intentional here
  const row = await db[model].findUnique({ where: { id }, select: { workspaceId: true } });
  if (!row || row.workspaceId !== workspaceId) {
    throw new Error("Not found in this workspace");
  }
}

export async function snapshotPostVersion(postId: string, authorId: string, note?: string) {
  const post = await db.post.findUnique({
    where: { id: postId },
    include: { channels: true, media: true, tags: true },
  });
  if (!post) return;
  const last = await db.postVersion.findFirst({
    where: { postId },
    orderBy: { version: "desc" },
  });
  await db.postVersion.create({
    data: {
      postId,
      authorId,
      version: (last?.version ?? 0) + 1,
      note: note ?? "Edited",
      snapshot: JSON.stringify({
        title: post.title,
        status: post.status,
        firstComment: post.firstComment,
        channels: post.channels.map((c) => ({ platform: c.platform, body: c.body, channelId: c.channelId })),
        mediaIds: post.media.map((m) => m.mediaId),
        tagIds: post.tags.map((t) => t.tagId),
      }),
    },
  });
}
