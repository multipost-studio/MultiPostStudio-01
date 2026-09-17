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

const EXT_FOR_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
  "application/pdf": "pdf",
};

/** Storage extension derived from a verified MIME type — never from the
 * client-supplied filename, so `evil.svg` can never land as `.svg`. */
export function extensionForMime(mimeType: string): string {
  return EXT_FOR_MIME[mimeType.toLowerCase()] ?? "bin";
}

function startsWith(buf: Uint8Array, sig: number[], offset = 0): boolean {
  if (buf.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (buf[offset + i] !== sig[i]) return false;
  return true;
}

/**
 * Magic-byte content sniffing. Returns the detected MIME type, or null when
 * the bytes match nothing known. Scriptable formats (SVG/HTML/XML) are
 * reported as their real types so the allowlist rejects them even when the
 * upload claimed `image/png` — the client `File.type` string is never
 * trusted on its own.
 */
export function sniffMimeType(buf: Uint8Array): string | null {
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(buf, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  // ISO-BMFF: ftyp box at offset 4; major brand decides mp4 vs mov vs avif.
  if (startsWith(buf, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = Buffer.from(buf.slice(8, 12)).toString("ascii");
    if (brand === "avif") return "image/avif";
    if (brand === "qt  ") return "video/quicktime";
    return "video/mp4";
  }
  // EBML (webm/matroska): scan the header for the DocType.
  if (startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3])) {
    const head = Buffer.from(buf.slice(0, 4096)).toString("ascii");
    if (head.includes("matroska")) return "video/x-matroska";
    return "video/webm";
  }
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46])) return "application/pdf";
  // Scriptable text formats: leading whitespace/BOM-tolerant ASCII check.
  const textHead = Buffer.from(buf.slice(0, 512)).toString("utf8").trimStart().toLowerCase();
  if (textHead.startsWith("<svg")) return "image/svg+xml";
  if (textHead.startsWith("<?xml") || textHead.startsWith("<html") || textHead.startsWith("<!doctype html")) {
    return "text/html";
  }
  return null;
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
