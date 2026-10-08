import { sniffMimeType } from "@/lib/media-types";

/**
 * Rules for images an admin uploads into Site Branding. Only formats every social
 * network and browser handle, judged by the file's real bytes (the browser's claimed
 * type and the file name are never trusted), so a script hidden in an "image" can't
 * get through. SVG is refused on purpose: it can carry script and networks won't show it.
 */

export type BrandingImageKind = "share" | "logo";

const MB = 1024 * 1024;
/** Kept under the ~4.5 MB request limit of serverless hosting. */
export const MAX_BYTES: Record<BrandingImageKind, number> = { share: 4 * MB, logo: 1 * MB };
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const KIND_LABEL: Record<BrandingImageKind, string> = { share: "share image", logo: "logo" };

export type ImageCheck = { ok: true; mime: (typeof ALLOWED_IMAGE_TYPES)[number] } | { ok: false; error: string };

export function isBrandingImageKind(v: unknown): v is BrandingImageKind {
  return v === "share" || v === "logo";
}

export function validateBrandingImage(kind: BrandingImageKind, bytes: Uint8Array): ImageCheck {
  if (bytes.length === 0) return { ok: false, error: "That file is empty." };
  if (bytes.length > MAX_BYTES[kind]) {
    return { ok: false, error: `That ${KIND_LABEL[kind]} is ${(bytes.length / MB).toFixed(1)} MB. The limit is ${MAX_BYTES[kind] / MB} MB.` };
  }
  const mime = sniffMimeType(bytes);
  if (mime === "image/svg+xml") return { ok: false, error: "SVG images can't be used here. Upload a PNG, JPG or WebP." };
  if (!mime || !(ALLOWED_IMAGE_TYPES as readonly string[]).includes(mime)) {
    return { ok: false, error: "Upload a PNG, JPG or WebP image." };
  }
  return { ok: true, mime: mime as (typeof ALLOWED_IMAGE_TYPES)[number] };
}
