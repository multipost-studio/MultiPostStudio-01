"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { saveUpload } from "@/lib/adapters/storage";
import { generateAltText } from "@/lib/adapters/ai";
import { bumpUsage } from "@/lib/adapters/billing";
import { refreshIntegrationIfNeeded } from "@/lib/integrations/oauth";
import {
  createPickerSession,
  getPickerSession,
  deletePickerSession,
  listPickedMediaItems,
  downloadPickedMediaItem,
  downloadThumbnail,
  type PickedMediaItem,
} from "@/lib/integrations/google-photos";
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

async function photosAccount(workspaceId: string) {
  return db.connectedIntegration.findUnique({
    where: { workspaceId_provider: { workspaceId, provider: "google_photos" } },
  });
}

/** Also returns the caller's fresh access token — every step after this needs it. */
async function requireToken(workspaceId: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const account = await photosAccount(workspaceId);
  if (!account) return { ok: false, error: "Connect Google Photos first (Integrations page)." };
  const token = await refreshIntegrationIfNeeded(account.id);
  if (!token) return { ok: false, error: "Google Photos session expired — reconnect it." };
  return { ok: true, token };
}

export async function startPhotosSessionAction() {
  const ctx = await withPermission("media.manage");
  try {
    await enforceRateLimit(`photos-session:${ctx.user.id}`, 20, 3_600_000);
  } catch (e) {
    if (e instanceof RateLimitError) return fail(e.message);
    throw e;
  }
  const t = await requireToken(ctx.active.workspace.id);
  if (!t.ok) return fail(t.error);
  try {
    const session = await createPickerSession(t.token);
    return ok(session);
  } catch (e) {
    logger.warn({ err: e }, "google photos session create failed");
    return fail("Couldn't open Google Photos");
  }
}

export async function pollPhotosSessionAction(sessionId: string) {
  const ctx = await withPermission("media.manage");
  if (typeof sessionId !== "string" || sessionId.length > 200) return fail("Invalid session");
  const t = await requireToken(ctx.active.workspace.id);
  if (!t.ok) return fail(t.error);
  try {
    const session = await getPickerSession(t.token, sessionId);
    return ok(session);
  } catch (e) {
    logger.warn({ err: e }, "google photos session poll failed");
    return fail("Couldn't check Google Photos selection");
  }
}

export async function listPhotosSessionItemsAction(sessionId: string) {
  const ctx = await withPermission("media.manage");
  if (typeof sessionId !== "string" || sessionId.length > 200) return fail("Invalid session");
  const t = await requireToken(ctx.active.workspace.id);
  if (!t.ok) return fail(t.error);
  try {
    const items = await listPickedMediaItems(t.token, sessionId);
    return ok(items);
  } catch (e) {
    logger.warn({ err: e }, "google photos list failed");
    return fail("Couldn't load your selection");
  }
}

export async function photosThumbnailAction(item: PickedMediaItem) {
  const ctx = await withPermission("media.manage");
  const t = await requireToken(ctx.active.workspace.id);
  if (!t.ok) return fail(t.error);
  try {
    const buf = await downloadThumbnail(t.token, item);
    if (!buf) return ok(null);
    return ok(`data:image/jpeg;base64,${buf.toString("base64")}`);
  } catch (e) {
    logger.warn({ err: e }, "google photos thumbnail failed");
    return ok(null); // thumbnails are a nicety — fail soft
  }
}

const itemSchema = z.object({
  id: z.string().min(1).max(300),
  filename: z.string().min(1).max(300),
  mimeType: z.string().min(1).max(100),
  baseUrl: z.string().url(),
  isVideo: z.boolean(),
});

const importSchema = z.object({
  sessionId: z.string().min(1).max(200),
  items: z.array(itemSchema).min(1).max(50),
  folderId: z.string().nullish(),
});

export async function importPhotosSessionAction(input: z.infer<typeof importSchema>) {
  const ctx = await withPermission("media.manage");
  try {
    // 10 Photos import batches/hour/user — each buffers up to 200MB/file server-side.
    await enforceRateLimit(`photos-import:${ctx.user.id}`, 10, 3_600_000);
  } catch (e) {
    if (e instanceof RateLimitError) return fail(e.message);
    throw e;
  }
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid selection");
  const { sessionId, items, folderId } = parsed.data;

  const t = await requireToken(ctx.active.workspace.id);
  if (!t.ok) return fail(t.error);

  const importedIds: string[] = [];
  const folder = await resolveFolderId(ctx.active.workspace.id, folderId);

  for (const item of items) {
    let file: { buf: Buffer; contentType: string };
    try {
      file = await downloadPickedMediaItem(t.token, item);
    } catch (e) {
      logger.warn({ err: e, itemId: item.id }, "google photos file download failed");
      continue;
    }

    if (file.buf.length > MAX_IMPORT_BYTES) continue;
    if ((await storageUsedBytes()) + file.buf.length > STORAGE_CAP_BYTES) break;

    const contentType = file.contentType.toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(contentType)) continue;
    const kind = kindFor(contentType);
    if (kind === "document") continue;

    const saved = await saveUpload(new File([new Uint8Array(file.buf)], item.filename, { type: file.contentType }));
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
        aiDescription: `Imported from Google Photos`,
        hash: `gphotos-${item.id}`,
      },
    });
    await bumpUsage(ctx.active.org.id, "storage_mb", Math.ceil(saved.sizeBytes / (1024 * 1024)));
    importedIds.push(asset.id);
  }

  await deletePickerSession(t.token, sessionId);

  if (importedIds.length === 0) {
    return fail("No files could be imported from Google Photos. Ensure files are under 200MB.");
  }

  revalidatePath("/media");
  return ok(importedIds, `${importedIds.length} file${importedIds.length === 1 ? "" : "s"} added`);
}
