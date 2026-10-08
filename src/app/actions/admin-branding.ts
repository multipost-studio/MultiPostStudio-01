"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/session";
import { logAudit } from "@/lib/events";
import { logger } from "@/lib/logger";
import { DEFAULT_BRANDING_CONFIG, MAX_IMPORT_BYTES, parseBrandingConfig, type BrandingConfig } from "@/lib/branding/config";
import { BRANDING_CONFIG_KEY, loadBranding, resetBranding, saveBranding } from "@/lib/branding/store";
import { KIND_LABEL, isBrandingImageKind, validateBrandingImage } from "@/lib/branding/upload";
import { saveUpload } from "@/lib/adapters/storage";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";

export type BrandingResult = { ok: true; config: BrandingConfig; message: string } | { ok: false; errors: string[] };

async function apply(config: BrandingConfig, actorId: string, action: string, message: string): Promise<BrandingResult> {
  const before = await loadBranding();
  await saveBranding(config, actorId);
  await logAudit({ actorId, action, targetType: "system", targetId: BRANDING_CONFIG_KEY, metadata: { before, after: config } });
  // Branding shows up in the footer, share cards, search-engine data, tags and receipts: refresh every page.
  revalidatePath("/", "layout");
  revalidatePath("/admin/branding");
  return { ok: true, config, message };
}

function isRedirect(err: unknown): boolean {
  return typeof err === "object" && err !== null && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");
}

/** Save everything on the Site Branding page. Validated strictly: nothing is saved if anything is wrong. */
export async function saveBrandingAction(input: unknown): Promise<BrandingResult> {
  try {
    const admin = await requirePlatformAdmin();
    const parsed = parseBrandingConfig(input);
    if (!parsed.ok) return parsed;
    return await apply(parsed.config, admin.id, "admin.branding_updated", "Branding saved");
  } catch (err) {
    if (isRedirect(err)) throw err;
    logger.error({ err }, "save branding failed");
    return { ok: false, errors: ["Couldn't save the branding settings."] };
  }
}

/** Import settings exported from this page (or another environment). All-or-nothing. */
export async function importBrandingAction(text: string): Promise<BrandingResult> {
  try {
    const admin = await requirePlatformAdmin();
    if (typeof text !== "string" || text.length === 0) return { ok: false, errors: ["The file is empty."] };
    if (text.length > MAX_IMPORT_BYTES) return { ok: false, errors: [`The file is larger than ${MAX_IMPORT_BYTES / 1000} KB.`] };
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return { ok: false, errors: ["The file is not valid JSON."] };
    }
    const candidate = raw && typeof raw === "object" && "config" in raw && !("credits" in raw) ? (raw as { config: unknown }).config : raw;
    const parsed = parseBrandingConfig(candidate);
    if (!parsed.ok) return parsed;
    return await apply(parsed.config, admin.id, "admin.branding_imported", "Branding imported");
  } catch (err) {
    if (isRedirect(err)) throw err;
    logger.error({ err }, "import branding failed");
    return { ok: false, errors: ["Couldn't save the imported branding."] };
  }
}

/** Back to the built-in branding. */
export async function resetBrandingAction(): Promise<BrandingResult> {
  try {
    const admin = await requirePlatformAdmin();
    const before = await loadBranding();
    await resetBranding();
    await logAudit({ actorId: admin.id, action: "admin.branding_reset", targetType: "system", targetId: BRANDING_CONFIG_KEY, metadata: { before } });
    revalidatePath("/", "layout");
    revalidatePath("/admin/branding");
    return { ok: true, config: DEFAULT_BRANDING_CONFIG, message: "Branding reset to the defaults" };
  } catch (err) {
    if (isRedirect(err)) throw err;
    logger.error({ err }, "reset branding failed");
    return { ok: false, errors: ["Couldn't reset the branding."] };
  }
}

export type UploadResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Upload the share image or the invoice logo. The file is judged by its real bytes
 * (PNG, JPG or WebP only, size-capped), stored with the same storage the Media Library
 * uses, and its address is handed back to fill the field. Nothing is published until
 * the admin presses Save all, so a wrong upload can simply be replaced.
 */
export async function uploadBrandingImageAction(kind: string, formData: FormData): Promise<UploadResult> {
  try {
    const admin = await requirePlatformAdmin();
    if (!isBrandingImageKind(kind)) return { ok: false, error: "Unknown image type." };
    const file = formData.get("file");
    if (!(file instanceof File)) return { ok: false, error: "Choose an image to upload." };

    try {
      await enforceRateLimit(`admin-branding-upload:${admin.id}`, 30, 3_600_000);
    } catch (e) {
      if (e instanceof RateLimitError) return { ok: false, error: e.message };
      throw e;
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = validateBrandingImage(kind, bytes);
    if (!check.ok) return check;

    let stored;
    try {
      stored = await saveUpload(file);
    } catch (err) {
      logger.warn({ err, kind }, "branding image upload failed");
      const msg = err instanceof Error && /not configured/i.test(err.message) ? "File storage isn't set up on this deployment yet, so images can't be uploaded. Paste an image address instead." : "Couldn't store that image. Try again.";
      return { ok: false, error: msg };
    }

    await logAudit({ actorId: admin.id, action: "admin.branding_image_uploaded", targetType: "system", targetId: BRANDING_CONFIG_KEY, metadata: { kind: KIND_LABEL[kind], bytes: bytes.length, mime: check.mime, url: stored.url } });
    return { ok: true, url: stored.url };
  } catch (err) {
    if (isRedirect(err)) throw err;
    logger.error({ err }, "branding image upload crashed");
    return { ok: false, error: "Couldn't upload that image." };
  }
}
