import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { MediaLibrary } from "./media-library";

export const metadata: Metadata = { title: "Media Library" };

export default async function MediaPage() {
  const ctx = await requireWorkspace();
  const wsId = ctx.active.workspace.id;

  const [assets, folders] = await Promise.all([
    db.mediaAsset.findMany({
      where: { workspaceId: wsId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { posts: true } }, uploader: { select: { name: true } } },
    }),
    db.mediaFolder.findMany({ where: { workspaceId: wsId }, orderBy: { name: "asc" } }),
  ]);

  return (
    <MediaLibrary
      canEdit={can(ctx.active.role, "media.manage")}
      folders={folders.map((f) => ({ id: f.id, name: f.name }))}
      assets={assets.map((a) => ({
        id: a.id,
        url: a.url,
        thumbUrl: a.thumbUrl,
        kind: a.kind,
        filename: a.filename,
        sizeBytes: a.sizeBytes,
        altText: a.altText,
        aiDescription: a.aiDescription,
        favorite: a.favorite,
        folderId: a.folderId,
        usage: a._count.posts,
        uploader: a.uploader.name,
        createdAt: a.createdAt.toISOString(),
      }))}
    />
  );
}
