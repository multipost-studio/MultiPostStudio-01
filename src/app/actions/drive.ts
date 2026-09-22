"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { saveUpload } from "@/lib/adapters/storage";
import { generateAltText } from "@/lib/adapters/ai";
import { bumpUsage } from "@/lib/adapters/billing";
import { refreshIntegrationIfNeeded } from "@/lib/integrations/oauth";
import { listDriveFiles, downloadDriveFile, type DriveFile } from "@/lib/integrations/drive";
import { ALLOWED_MIME_TYPES, kindFor, resolveFolderId } from "@/lib/media-types";
import { withPermission, ok, fail } from "./_helpers";
import { logger } from "@/lib/logger";

const STORAGE_CAP_BYTES = Math.floor(9.5 * 1024 * 1024 * 1024);
const MAX_IMPORT_BYTES = 200 * 1024 * 1024;

async function storageUsedBytes(): Promise<number> {
  const r = await db.mediaAsset.aggregate({ _sum: { sizeBytes: true } });
  return Number(r._sum.sizeBytes ?? 0);
}

async function driveAccount(workspaceId: string) {
  return db.connectedIntegration.findUnique({
    where: { workspaceId_provider: { workspaceId, provider: "google_drive" } },
  });
}

export async function listDriveFilesAction(query: string, pageToken?: string) {
  const ctx = await withPermission("media.manage");
  const account = await driveAccount(ctx.active.workspace.id);
  if (!account) return fail("Connect Google Drive first (Integrations page).");
  const token = await refreshIntegrationIfNeeded(account.id);
  if (!token) return fail("Google Drive session expired — reconnect it.");
  try {
    const { files, nextPageToken } = await listDriveFiles(token, { query, pageToken });
    return ok({ files, nextPageToken });
  } catch (e) {
    // Provider error text can embed request URLs/tokens — log it, don't toast it.
    logger.warn({ err: e }, "drive list failed");
    return fail("Couldn't list Drive files");
  }
}

/** Only ever fetch thumbnailLink urls Google itself returned, and only its own host. */
function isGoogleUserContentUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === "googleusercontent.com" || h.endsWith(".googleusercontent.com");
  } catch {
    return false;
  }
}

export async function driveThumbnailAction(thumbnailLink: string) {
  const ctx = await withPermission("media.manage");
  if (!isGoogleUserContentUrl(thumbnailLink)) return fail("Invalid thumbnail reference");
  const account = await driveAccount(ctx.active.workspace.id);
  if (!account) return fail("Connect Google Drive first (Integrations page).");
  const token = await refreshIntegrationIfNeeded(account.id);
  if (!token) return fail("Google Drive session expired — reconnect it.");
  try {
    const res = await fetch(thumbnailLink, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) return fail(`Thumbnail ${res.status}`);
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 2 * 1024 * 1024) return fail("Thumbnail too large");
    return ok(`data:${contentType};base64,${buf.toString("base64")}`);
  } catch (e) {
    logger.warn({ err: e }, "drive thumbnail failed");
    return fail("Couldn't load thumbnail");
  }
}

const importSchema = z.object({
  fileId: z.string().min(1).max(200),
  name: z.string().min(1).max(300),
  folderId: z.string().nullish(),
});

export async function importDriveFileAction(input: z.infer<typeof importSchema>) {
  const ctx = await withPermission("media.manage");
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid file reference");
  const d = parsed.data;

  const account = await driveAccount(ctx.active.workspace.id);
  if (!account) return fail("Connect Google Drive first (Integrations page).");
  const token = await refreshIntegrationIfNeeded(account.id);
  if (!token) return fail("Google Drive session expired — reconnect it.");

  let file: { buf: Buffer; contentType: string };
  try {
    file = await downloadDriveFile(token, d.fileId);
  } catch (e) {
    logger.warn({ err: e }, "drive download failed");
    return fail("Couldn't download the file from Drive");
  }
  if (file.buf.length > MAX_IMPORT_BYTES) return fail("File is over 200MB");
  if ((await storageUsedBytes()) + file.buf.length > STORAGE_CAP_BYTES) {
    return fail("Media storage is full (10 GB limit). Delete unused files to import more.");
  }
  // Same allowlist as direct upload — a naive "video/*"/"image/*" prefix check
  // (what this used to do) lets image/svg+xml through as an "image", and an
  // imported SVG can carry inline <script>: stored XSS when opened directly.
  const contentType = file.contentType.toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(contentType)) return fail("Only images and videos can be imported from Drive");
  const kind = kindFor(contentType);
  if (kind === "document") return fail("Only images and videos can be imported from Drive"); // matches direct-upload's document support being separate from this Drive path's original (image/video-only) scope

  const saved = await saveUpload(new File([new Uint8Array(file.buf)], d.name, { type: file.contentType }));
  const folderId = await resolveFolderId(ctx.active.workspace.id, d.folderId);
  const asset = await db.mediaAsset.create({
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
      aiDescription: `Imported from Google Drive`,
      hash: `drive-${d.fileId}`,
    },
  });
  await bumpUsage(ctx.active.org.id, "storage_mb", Math.ceil(saved.sizeBytes / (1024 * 1024)));
  revalidatePath("/media");
  return ok(asset.id, "File added");
}

const importFilesSchema = z.object({
  files: z
    .array(
      z.object({
        fileId: z.string().min(1).max(200),
        name: z.string().min(1).max(300),
      }),
    )
    .min(1)
    .max(20),
  folderId: z.string().nullish(),
});

export type DrivePickerConfig = {
  connected: boolean;
  needsReconnect: boolean;
  message?: string;
  accessToken?: string;
  developerKey: string;
  clientId: string;
  accountEmail?: string | null;
};

/**
 * Provides a short-lived access token and configuration for the client-side Google Picker.
 * Strictly scoped to the authenticated workspace member with media.manage permissions.
 * Never exposes refresh tokens or client secrets.
 */
export async function getDrivePickerConfigAction() {
  const ctx = await withPermission("media.manage");
  const account = await driveAccount(ctx.active.workspace.id);
  if (!account) return fail("Connect Google Drive first (Integrations page).");

  const developerKey = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY || "";
  const clientId = process.env.OAUTH_GOOGLE_DRIVE_CLIENT_ID || "";

  // Detect legacy connections authorized under drive.readonly that lack drive.file
  const isLegacy = !account.scopes?.includes("drive.file");
  if (isLegacy) {
    return ok<DrivePickerConfig>({
      connected: true,
      needsReconnect: true,
      message: "Your Google Drive connection needs to be updated to use our new secure file picker.",
      developerKey,
      clientId,
      accountEmail: account.accountEmail,
    });
  }

  const token = await refreshIntegrationIfNeeded(account.id);
  if (!token) return fail("Google Drive session expired — reconnect it.");

  return ok<DrivePickerConfig>({
    connected: true,
    needsReconnect: false,
    accessToken: token,
    developerKey,
    clientId,
    accountEmail: account.accountEmail,
  });
}

export async function importDriveFilesAction(input: z.infer<typeof importFilesSchema>) {
  const ctx = await withPermission("media.manage");
  const parsed = importFilesSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid files reference");
  const { files, folderId } = parsed.data;

  const account = await driveAccount(ctx.active.workspace.id);
  if (!account) return fail("Connect Google Drive first (Integrations page).");
  const token = await refreshIntegrationIfNeeded(account.id);
  if (!token) return fail("Google Drive session expired — reconnect it.");

  const importedIds: string[] = [];
  const folder = await resolveFolderId(ctx.active.workspace.id, folderId);

  for (const item of files) {
    let file: { buf: Buffer; contentType: string };
    try {
      file = await downloadDriveFile(token, item.fileId);
    } catch (e) {
      logger.warn({ err: e, fileId: item.fileId }, "drive file download failed");
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
        aiDescription: `Imported from Google Drive`,
        hash: `drive-${item.fileId}`,
      },
    });
    await bumpUsage(ctx.active.org.id, "storage_mb", Math.ceil(saved.sizeBytes / (1024 * 1024)));
    importedIds.push(asset.id);
  }

  if (importedIds.length === 0) {
    return fail("No files could be imported from Google Drive. Ensure files are images or videos under 200MB.");
  }

  revalidatePath("/media");
  return ok(importedIds, `${importedIds.length} file${importedIds.length === 1 ? "" : "s"} added`);
}

export async function disconnectIntegrationAction(id: string) {
  const ctx = await withPermission("integrations.manage");
  const row = await db.connectedIntegration.findUnique({ where: { id } });
  if (!row || row.workspaceId !== ctx.active.workspace.id) return fail("Not found");
  await db.connectedIntegration.delete({ where: { id } });
  revalidatePath("/integrations");
  return ok(undefined, "Disconnected");
}

export type { DriveFile };
