/**
 * Shared media-type allowlist. Media Library only ever needs to hold what the
 * composer can attach to a post: images, videos, and reference PDFs.
 * Deliberately excludes image/svg+xml (can carry inline <script>) and any
 * text/html-ish type — object storage reflects whatever content-type is
 * claimed at upload, and an HTML/SVG "media" file served back with that type
 * would execute as a document, not render as a harmless image, if opened
 * directly. Every import path (direct upload, Drive, Unsplash-fixed-type)
 * must enforce this same set — a path that checks only "image/*"/"video/*"
 * lets image/svg+xml through as an "image".
 */
export const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
  "application/pdf",
]);

export function kindFor(mimeType: string): "video" | "image" | "document" {
  return mimeType.startsWith("video/") ? "video" : mimeType.startsWith("image/") ? "image" : "document";
}

/**
 * A client-supplied folderId that isn't validated against the caller's
 * workspace doesn't reach another tenant's data on its own (listing queries
 * are scoped by the asset's own workspaceId), but it's an orphaned/dangling
 * reference and inconsistent with the ownership checks everywhere else in
 * this file's callers — silently drop it to "no folder" rather than store it.
 */
export async function resolveFolderId(workspaceId: string, folderId: string | null | undefined): Promise<string | null> {
  if (!folderId) return null;
  const { db } = await import("@/lib/db");
  const folder = await db.mediaFolder.findUnique({ where: { id: folderId } });
  return folder && folder.workspaceId === workspaceId ? folderId : null;
}
