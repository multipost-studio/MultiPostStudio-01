"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { saveUpload } from "@/lib/adapters/storage";
import { generateAltText } from "@/lib/adapters/ai";
import { bumpUsage } from "@/lib/adapters/billing";
import { refreshIntegrationIfNeeded } from "@/lib/integrations/oauth";
import { listOneDriveFiles, downloadOneDriveFile, oneDriveThumbnailUrl } from "@/lib/integrations/onedrive";
import { ALLOWED_MIME_TYPES, kindFor, resolveFolderId } from "@/lib/media-types";
import { withPermission, ok, fail } from "./_helpers";
import { logger } from "@/lib/logger";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";

const STORAGE_CAP_BYTES = Math.floor(9.5 * 1024 * 1024 * 1024);
const MAX_IMPORT_BYTES = 200 * 1024 * 1024;

async function storageUsedBytes(): Promise<number> {
  const r = await db.mediaAsset.aggregate({ _sum: { sizeBytes: true } });
  return Number(r._sum.sizeBytes ?? 0);
}

async function oneDriveAccount(workspaceId: string) {
  return db.connectedIntegration.findUnique({
    where: { workspaceId_provider: { workspaceId, provider: "onedrive" } },
  });
}

export async function listOneDriveFilesAction(folderId?: string) {
  const ctx = await withPermission("media.manage");
  if (folderId !== undefined && (typeof folderId !== "string" || folderId.length > 200)) return fail("Invalid folder");
  const account = await oneDriveAccount(ctx.active.workspace.id);
  if (!account) return fail("Connect OneDrive first (Integrations page).");
  const token = await refreshIntegrationIfNeeded(account.id);
  if (!token) return fail("OneDrive session expired — reconnect it.");
  try {
    const { files } = await listOneDriveFiles(token, folderId);
    return ok(files);
  } catch (e) {
    logger.warn({ err: e }, "onedrive list failed");
    return fail("Couldn't list OneDrive files");
  }
}

export async function oneDriveThumbnailAction(itemId: string) {
  const ctx = await withPermission("media.manage");
  if (typeof itemId !== "string" || itemId.length > 200) return fail("Invalid item");
  const account = await oneDriveAccount(ctx.active.workspace.id);
  if (!account) return fail("Connect OneDrive first (Integrations page).");
  const token = await refreshIntegrationIfNeeded(account.id);
  if (!token) return fail("OneDrive session expired — reconnect it.");
  try {
    const url = await oneDriveThumbnailUrl(token, itemId);
    if (!url) return ok(null);
    // Pre-signed content URL — no bearer header, matches oneDriveThumbnailUrl's doc.
    const res = await fetch(url);
    if (!res.ok) return ok(null);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 2 * 1024 * 1024) return ok(null);
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    return ok(`data:${contentType};base64,${buf.toString("base64")}`);
  } catch (e) {
    logger.warn({ err: e }, "onedrive thumbnail failed");
    return ok(null); // thumbnails are a nicety — fail soft, never block browsing
  }
}

const importFilesSchema = z.object({
  files: z
    .array(z.object({ id: z.string().min(1).max(200), name: z.string().min(1).max(300) }))
    .min(1)
    .max(20),
  folderId: z.string().nullish(),
});

export async function importOneDriveFilesAction(input: z.infer<typeof importFilesSchema>) {
  const ctx = await withPermission("media.manage");
  try {
    // 10 OneDrive import batches/hour/user — each buffers up to 200MB/file server-side.
    await enforceRateLimit(`onedrive-import:${ctx.user.id}`, 10, 3_600_000);
  } catch (e) {
    if (e instanceof RateLimitError) return fail(e.message);
    throw e;
  }
  const parsed = importFilesSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid files reference");
  const { files, folderId } = parsed.data;

  const account = await oneDriveAccount(ctx.active.workspace.id);
  if (!account) return fail("Connect OneDrive first (Integrations page).");
  const token = await refreshIntegrationIfNeeded(account.id);
  if (!token) return fail("OneDrive session expired — reconnect it.");

  const importedIds: string[] = [];
  const folder = await resolveFolderId(ctx.active.workspace.id, folderId);

  for (const item of files) {
    let file: { buf: Buffer; contentType: string };
    try {
      file = await downloadOneDriveFile(token, item.id);
    } catch (e) {
      logger.warn({ err: e, itemId: item.id }, "onedrive file download failed");
      continue;
    }

    if (file.buf.length > MAX_IMPORT_BYTES) continue;
    if ((await storageUsedBytes()) + file.buf.length > STORAGE_CAP_BYTES) break;

    const contentType = file.contentType.toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(contentType)) continue;
    const kind = kindFor(contentType);
    if (kind === "document") continue;

    const saved = await saveUpload(new File([new Uint8Array(file.buf)], item.name, { type: file.contentType }));
    const asset = await db.mediaAsset.create({
      data: {
        workspaceId: ctx.active.workspace.id,
        folderId: folder,
        uploaderId: ctx.user.id,
        kind,
        url: saved.url,
        thumbUrl: saved.url,
        filename: saved.filename,
        mimeType: saved.mimeType,
        sizeBytes: saved.sizeBytes,
        altText: generateAltText({ filename: saved.filename }),
        aiDescription: `Imported from OneDrive`,
        hash: `onedrive-${item.id}`,
      },
    });
    await bumpUsage(ctx.active.org.id, "storage_mb", Math.ceil(saved.sizeBytes / (1024 * 1024)));
    importedIds.push(asset.id);
  }

  if (importedIds.length === 0) {
    return fail("No files could be imported from OneDrive. Ensure files are images or videos under 200MB.");
  }

  revalidatePath("/media");
  return ok(importedIds, `${importedIds.length} file${importedIds.length === 1 ? "" : "s"} added`);
}
