import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { flags } from "@/lib/env";
import { MediaLibrary } from "./media-library";

export const metadata: Metadata = { title: "Media Library" };

export default async function MediaPage() {
  const ctx = await requireWorkspace();
  const wsId = ctx.active.workspace.id;

  const [assets, folders, dropbox, onedrive] = await Promise.all([
    db.mediaAsset.findMany({
      where: { workspaceId: wsId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { _count: { select: { posts: true } }, uploader: { select: { name: true } } },
    }),
    db.mediaFolder.findMany({ where: { workspaceId: wsId }, orderBy: { name: "asc" } }),
    flags.dropbox
      ? db.connectedIntegration.findUnique({ where: { workspaceId_provider: { workspaceId: wsId, provider: "dropbox" } } })
      : null,
    flags.onedrive
      ? db.connectedIntegration.findUnique({ where: { workspaceId_provider: { workspaceId: wsId, provider: "onedrive" } } })
      : null,
  ]);

  return (
    <MediaLibrary
      canEdit={can(ctx.active.role, "media.manage")}
      unsplashEnabled={flags.unsplash}
      driveEnabled={flags.googleDrive}
      dropboxEnabled={flags.dropbox}
      dropboxConnected={dropbox?.status === "connected"}
      onedriveEnabled={flags.onedrive}
      onedriveConnected={onedrive?.status === "connected"}
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
