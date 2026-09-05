"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { saveUpload } from "@/lib/adapters/storage";
import { generateAltText } from "@/lib/adapters/ai";
import { bumpUsage } from "@/lib/adapters/billing";
import { refreshIntegrationIfNeeded } from "@/lib/integrations/oauth";
import { listDriveFiles, downloadDriveFile, type DriveFile } from "@/lib/integrations/drive";
import { withPermission, ok, fail } from "./_helpers";

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
    return fail(e instanceof Error ? e.message : "Couldn't list Drive files");
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
    return fail(e instanceof Error ? e.message : "Couldn't load thumbnail");
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
    return fail(e instanceof Error ? e.message : "Couldn't download the file from Drive");
  }
  if (file.buf.length > MAX_IMPORT_BYTES) return fail("File is over 200MB");
  if ((await storageUsedBytes()) + file.buf.length > STORAGE_CAP_BYTES) {
    return fail("Media storage is full (10 GB limit). Delete unused files to import more.");
  }
  const kind = file.contentType.startsWith("video/") ? "video" : file.contentType.startsWith("image/") ? "image" : "document";
  if (kind === "document") return fail("Only images and videos can be imported from Drive");

  const saved = await saveUpload(new File([new Uint8Array(file.buf)], d.name, { type: file.contentType }));
  const asset = await db.mediaAsset.create({
    data: {
      workspaceId: ctx.active.workspace.id,
      folderId: d.folderId ?? null,
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

export async function disconnectIntegrationAction(id: string) {
  const ctx = await withPermission("integrations.manage");
  const row = await db.connectedIntegration.findUnique({ where: { id } });
  if (!row || row.workspaceId !== ctx.active.workspace.id) return fail("Not found");
  await db.connectedIntegration.delete({ where: { id } });
  revalidatePath("/integrations");
  return ok(undefined, "Disconnected");
}

export type { DriveFile };
