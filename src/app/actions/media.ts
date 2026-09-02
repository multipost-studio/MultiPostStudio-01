"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { saveUpload } from "@/lib/adapters/storage";
import { generateAltText, generateImageDescription } from "@/lib/adapters/ai";
import { bumpUsage } from "@/lib/adapters/billing";
import { withPermission, ok, fail } from "./_helpers";

export async function uploadMediaAction(formData: FormData) {
  const ctx = await withPermission("media.manage");
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const folderId = (formData.get("folderId") as string) || null;
  if (files.length === 0) return fail("No files selected");

  let totalMb = 0;
  for (const file of files) {
    if (file.size > 25 * 1024 * 1024) return fail(`${file.name} is over 25MB`);
    const saved = await saveUpload(file);
    const kind = saved.mimeType.startsWith("video/")
      ? "video"
      : saved.mimeType.startsWith("image/")
        ? "image"
        : "document";
    await db.mediaAsset.create({
      data: {
        workspaceId: ctx.active.workspace.id,
        folderId,
        uploaderId: ctx.user.id,
        kind,
        url: saved.url,
        thumbUrl: saved.url,
        filename: saved.filename,
        mimeType: saved.mimeType,
        sizeBytes: saved.sizeBytes,
        altText: generateAltText({ filename: saved.filename }),
        aiDescription: generateImageDescription(saved.filename.replace(/\.[a-z0-9]+$/i, "")),
        hash: `${saved.sizeBytes}-${saved.filename}`,
      },
    });
    totalMb += saved.sizeBytes / (1024 * 1024);
  }
  await bumpUsage(ctx.active.org.id, "storage_mb", Math.ceil(totalMb));
  revalidatePath("/media");
  return ok(undefined, `${files.length} file${files.length === 1 ? "" : "s"} uploaded`);
}

export async function createFolderAction(_prev: unknown, formData: FormData) {
  const ctx = await withPermission("media.manage");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return fail("Folder name required");
  await db.mediaFolder.create({ data: { workspaceId: ctx.active.workspace.id, name } });
  revalidatePath("/media");
  return ok(undefined, "Folder created");
}

export async function toggleFavoriteAction(id: string) {
  const ctx = await withPermission("media.manage");
  const asset = await db.mediaAsset.findUnique({ where: { id } });
  if (!asset || asset.workspaceId !== ctx.active.workspace.id) return fail("Not found");
  await db.mediaAsset.update({ where: { id }, data: { favorite: !asset.favorite } });
  revalidatePath("/media");
  return ok();
}

export async function updateAssetAction(id: string, data: { altText?: string; folderId?: string | null }) {
  const ctx = await withPermission("media.manage");
  const asset = await db.mediaAsset.findUnique({ where: { id } });
  if (!asset || asset.workspaceId !== ctx.active.workspace.id) return fail("Not found");
  await db.mediaAsset.update({
    where: { id },
    data: {
      ...(data.altText !== undefined ? { altText: data.altText } : {}),
      ...(data.folderId !== undefined ? { folderId: data.folderId } : {}),
    },
  });
  revalidatePath("/media");
  return ok(undefined, "Updated");
}

export async function deleteAssetAction(id: string) {
  const ctx = await withPermission("media.manage");
  const asset = await db.mediaAsset.findUnique({ where: { id } });
  if (!asset || asset.workspaceId !== ctx.active.workspace.id) return fail("Not found");
  const inUse = await db.mediaOnPost.count({ where: { mediaId: id } });
  if (inUse > 0) return fail(`In use by ${inUse} post${inUse === 1 ? "" : "s"}`);
  await db.mediaAsset.delete({ where: { id } });
  revalidatePath("/media");
  return ok(undefined, "Deleted");
}
