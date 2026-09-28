"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { saveUpload } from "@/lib/adapters/storage";
import { generateAltText } from "@/lib/adapters/ai";
import { bumpUsage } from "@/lib/adapters/billing";
import { refreshIntegrationIfNeeded } from "@/lib/integrations/oauth";
import { listDropboxFiles, downloadDropboxFile, dropboxThumbnail } from "@/lib/integrations/dropbox";
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

async function dropboxAccount(workspaceId: string) {
  return db.connectedIntegration.findUnique({
    where: { workspaceId_provider: { workspaceId, provider: "dropbox" } },
  });
}

export async function listDropboxFilesAction(path = "") {
  const ctx = await withPermission("media.manage");
  if (typeof path !== "string" || path.length > 1000) return fail("Invalid path");
  const account = await dropboxAccount(ctx.active.workspace.id);
  if (!account) return fail("Connect Dropbox first (Integrations page).");
  const token = await refreshIntegrationIfNeeded(account.id);
  if (!token) return fail("Dropbox session expired — reconnect it.");
  try {
    const { files } = await listDropboxFiles(token, path);
    return ok(files);
  } catch (e) {
    logger.warn({ err: e }, "dropbox list failed");
    return fail("Couldn't list Dropbox files");
  }
}

export async function dropboxThumbnailAction(path: string) {
  const ctx = await withPermission("media.manage");
  if (typeof path !== "string" || path.length > 1000) return fail("Invalid path");
  const account = await dropboxAccount(ctx.active.workspace.id);
  if (!account) return fail("Connect Dropbox first (Integrations page).");
  const token = await refreshIntegrationIfNeeded(account.id);
  if (!token) return fail("Dropbox session expired — reconnect it.");
  try {
    const buf = await dropboxThumbnail(token, path);
    if (!buf) return ok(null);
    return ok(`data:image/jpeg;base64,${buf.toString("base64")}`);
  } catch (e) {
    logger.warn({ err: e }, "dropbox thumbnail failed");
    return ok(null); // thumbnails are a nicety — fail soft, never block browsing
  }
}

const importFilesSchema = z.object({
  files: z
    .array(z.object({ path: z.string().min(1).max(1000), name: z.string().min(1).max(300) }))
    .min(1)
    .max(20),
  folderId: z.string().nullish(),
});

export async function importDropboxFilesAction(input: z.infer<typeof importFilesSchema>) {
  const ctx = await withPermission("media.manage");
  try {
    // 10 Dropbox import batches/hour/user — each buffers up to 200MB/file server-side.
    await enforceRateLimit(`dropbox-import:${ctx.user.id}`, 10, 3_600_000);
  } catch (e) {
    if (e instanceof RateLimitError) return fail(e.message);
    throw e;
  }
  const parsed = importFilesSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid files reference");
  const { files, folderId } = parsed.data;

  const account = await dropboxAccount(ctx.active.workspace.id);
  if (!account) return fail("Connect Dropbox first (Integrations page).");
  const token = await refreshIntegrationIfNeeded(account.id);
  if (!token) return fail("Dropbox session expired — reconnect it.");

  const importedIds: string[] = [];
  const folder = await resolveFolderId(ctx.active.workspace.id, folderId);

  for (const item of files) {
    let file: { buf: Buffer; contentType: string };
    try {
      file = await downloadDropboxFile(token, item.path);
    } catch (e) {
      logger.warn({ err: e, path: item.path }, "dropbox file download failed");
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
        aiDescription: `Imported from Dropbox`,
        hash: `dropbox-${item.path}`,
      },
    });
    await bumpUsage(ctx.active.org.id, "storage_mb", Math.ceil(saved.sizeBytes / (1024 * 1024)));
    importedIds.push(asset.id);
  }

  if (importedIds.length === 0) {
    return fail("No files could be imported from Dropbox. Ensure files are images or videos under 200MB.");
  }

  revalidatePath("/media");
  return ok(importedIds, `${importedIds.length} file${importedIds.length === 1 ? "" : "s"} added`);
}
