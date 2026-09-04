"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { saveUpload, presignUpload } from "@/lib/adapters/storage";
import { generateAltText, generateImageDescription } from "@/lib/adapters/ai";
import { bumpUsage } from "@/lib/adapters/billing";
import { searchUnsplash, triggerUnsplashDownload } from "@/lib/adapters/unsplash";
import { flags } from "@/lib/env";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { withPermission, ok, fail } from "./_helpers";

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024; // 200MB — covers platform video limits

// Keep total object storage comfortably under Cloudflare R2's 10 GB free tier.
const STORAGE_CAP_BYTES = Math.floor(9.5 * 1024 * 1024 * 1024);

function kindFor(mimeType: string) {
  return mimeType.startsWith("video/") ? "video" : mimeType.startsWith("image/") ? "image" : "document";
}

/** Total bytes stored across all media assets. */
async function storageUsedBytes(): Promise<number> {
  const r = await db.mediaAsset.aggregate({ _sum: { sizeBytes: true } });
  return Number(r._sum.sizeBytes ?? 0);
}

/** Reject when adding `addBytes` would push storage past the free-tier cap. */
async function overStorageCap(addBytes: number): Promise<boolean> {
  return (await storageUsedBytes()) + addBytes > STORAGE_CAP_BYTES;
}

const STORAGE_FULL_MSG =
  "Media storage is full (10 GB limit). Delete unused files, or expand your object storage, to upload more.";

/**
 * Step 1 of a large-file upload: hand the browser a presigned PUT URL so the
 * file goes straight to object storage, never through the serverless function
 * (Vercel caps request bodies at ~4.5MB). Returns `presigned: null` when object
 * storage isn't configured — the caller then falls back to uploadMediaAction.
 */
export async function createUploadUrlAction(input: {
  filename: string;
  contentType: string;
  size: number;
}) {
  await withPermission("media.manage");
  const parsed = z
    .object({
      filename: z.string().min(1).max(300),
      contentType: z.string().min(1).max(150),
      size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
    })
    .safeParse(input);
  if (!parsed.success) return fail("That file can't be uploaded (name, type or size).");
  if (await overStorageCap(parsed.data.size)) return fail(STORAGE_FULL_MSG);

  const presigned = await presignUpload(parsed.data.filename, parsed.data.contentType);
  return ok({ presigned }); // presigned is null when storage isn't configured
}

/**
 * Step 2: after the browser PUTs the file to storage, record the asset. Payload
 * is tiny (metadata only), so this is safe through the serverless function.
 */
export async function registerMediaAction(input: {
  key: string;
  url: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  folderId?: string | null;
  /** Poster frame URL for video (captured client-side). */
  thumbUrl?: string | null;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
}) {
  const ctx = await withPermission("media.manage");
  const parsed = z
    .object({
      key: z.string().min(1).max(400),
      url: z.string().url(),
      filename: z.string().min(1).max(300),
      contentType: z.string().min(1).max(150),
      sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
      folderId: z.string().nullish(),
      thumbUrl: z.string().url().nullish(),
      width: z.number().int().positive().max(100_000).nullish(),
      height: z.number().int().positive().max(100_000).nullish(),
      durationSec: z.number().int().nonnegative().max(86_400).nullish(),
    })
    .safeParse(input);
  if (!parsed.success) return fail("Invalid upload metadata");
  const d = parsed.data;
  if (await overStorageCap(d.sizeBytes)) return fail(STORAGE_FULL_MSG);

  const asset = await db.mediaAsset.create({
    data: {
      workspaceId: ctx.active.workspace.id,
      folderId: d.folderId ?? null,
      uploaderId: ctx.user.id,
      kind: kindFor(d.contentType),
      url: d.url,
      thumbUrl: d.thumbUrl ?? d.url,
      width: d.width ?? null,
      height: d.height ?? null,
      durationSec: d.durationSec ?? null,
      filename: d.filename,
      mimeType: d.contentType,
      sizeBytes: d.sizeBytes,
      altText: generateAltText({ filename: d.filename }),
      aiDescription: generateImageDescription(d.filename.replace(/\.[a-z0-9]+$/i, "")),
      hash: `${d.sizeBytes}-${d.filename}`,
    },
  });
  await bumpUsage(ctx.active.org.id, "storage_mb", Math.ceil(d.sizeBytes / (1024 * 1024)));
  revalidatePath("/media");
  return ok(asset.id, "Uploaded");
}

export async function uploadMediaAction(formData: FormData) {
  const ctx = await withPermission("media.manage");
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const folderId = (formData.get("folderId") as string) || null;
  if (files.length === 0) return fail("No files selected");

  const incoming = files.reduce((n, f) => n + f.size, 0);
  if (await overStorageCap(incoming)) return fail(STORAGE_FULL_MSG);

  let totalMb = 0;
  for (const file of files) {
    if (file.size > 25 * 1024 * 1024) return fail(`${file.name} is over 25MB`);
    const saved = await saveUpload(file);
    const kind = kindFor(saved.mimeType);
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

/* ---------------- Unsplash stock photos ---------------- */

export async function searchUnsplashAction(query: string, page = 1) {
  const ctx = await withPermission("media.manage");
  if (!flags.unsplash) return fail("Unsplash isn't configured");
  try {
    await enforceRateLimit(`unsplash:${ctx.user.id}`, 40, 60_000);
  } catch (e) {
    if (e instanceof RateLimitError) return fail(e.message);
    throw e;
  }
  try {
    const { results, totalPages } = await searchUnsplash(query, page);
    return ok({ results, totalPages });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Unsplash search failed");
  }
}

const unsplashImportSchema = z.object({
  id: z.string().min(1).max(64),
  regular: z.string().url(),
  downloadLocation: z.string().url(),
  alt: z.string().max(400).default("Unsplash photo"),
  creditName: z.string().max(200).default("Unsplash"),
  creditUrl: z.string().url().optional(),
  folderId: z.string().nullish(),
});

export async function importUnsplashAction(input: z.infer<typeof unsplashImportSchema>) {
  const ctx = await withPermission("media.manage");
  if (!flags.unsplash) return fail("Unsplash isn't configured");
  const parsed = unsplashImportSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid photo reference");
  const d = parsed.data;

  // API terms: register the download before using the photo.
  await triggerUnsplashDownload(d.downloadLocation);

  const res = await fetch(d.regular);
  if (!res.ok) return fail(`Couldn't fetch the photo (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (await overStorageCap(buf.length)) return fail(STORAGE_FULL_MSG);

  const file = new File([buf], `unsplash-${d.id}.jpg`, { type: "image/jpeg" });
  const saved = await saveUpload(file);

  const credit = `Photo by ${d.creditName} on Unsplash`;
  const asset = await db.mediaAsset.create({
    data: {
      workspaceId: ctx.active.workspace.id,
      folderId: d.folderId ?? null,
      uploaderId: ctx.user.id,
      kind: "image",
      url: saved.url,
      thumbUrl: saved.url,
      filename: saved.filename,
      mimeType: saved.mimeType,
      sizeBytes: saved.sizeBytes,
      altText: d.alt,
      aiDescription: d.creditUrl ? `${credit} (${d.creditUrl})` : credit,
      hash: `${saved.sizeBytes}-${saved.filename}`,
    },
  });
  await bumpUsage(ctx.active.org.id, "storage_mb", Math.ceil(saved.sizeBytes / (1024 * 1024)));
  revalidatePath("/media");
  return ok(asset.id, "Photo added");
}
