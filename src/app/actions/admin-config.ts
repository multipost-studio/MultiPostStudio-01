"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/events";
import { requireAdminAccess, requireAdminPermission } from "@/lib/session";
import { parseReason } from "@/lib/admin-reason";
import { configEntry } from "@/lib/config-registry";
import { withRevisionMeta } from "@/lib/config-versions";

/**
 * Restore an admin-managed config to the value it had after an earlier revision. The restore goes through the module's own
 * normalizer and save function (so it is validated, caches are cleared, and a new revision is recorded saying it was a
 * restore), never by writing the stored text directly.
 */
type Result = { ok: true; message: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

async function apply(key: string, after: string, actorId: string): Promise<void> {
  if (after === "") {
    switch (key) {
      case "site_branding": return void (await (await import("@/lib/branding/store")).resetBranding(actorId));
      case "footer_config": return void (await (await import("@/lib/footer/store")).resetFooterConfig(actorId));
      case "festival_config": return void (await (await import("@/lib/festivals/store")).resetFestivalConfig(actorId));
      case "review_config": return void (await (await import("@/lib/reviews/store")).resetReviewConfig(actorId));
      case "health_config": return void (await (await import("@/lib/health/config-store")).resetHealthConfig(actorId));
    }
    throw new Error("unknown config");
  }
  const parsed: unknown = JSON.parse(after);
  switch (key) {
    case "site_branding": {
      const { normalizeBrandingConfig } = await import("@/lib/branding/config");
      return void (await (await import("@/lib/branding/store")).saveBranding(normalizeBrandingConfig(parsed), actorId));
    }
    case "footer_config": {
      const { normalizeFooterConfig } = await import("@/lib/footer/config");
      return void (await (await import("@/lib/footer/store")).saveFooterConfig(normalizeFooterConfig(parsed), actorId));
    }
    case "festival_config": {
      const { normalizeFestivalConfig } = await import("@/lib/festivals/config");
      return void (await (await import("@/lib/festivals/store")).saveFestivalConfig(normalizeFestivalConfig(parsed), actorId));
    }
    case "review_config": {
      const { normalizeReviewConfig } = await import("@/lib/reviews/config");
      return void (await (await import("@/lib/reviews/store")).saveReviewConfig(normalizeReviewConfig(parsed), actorId));
    }
    case "health_config": {
      const { normalizeHealthConfig } = await import("@/lib/health/config");
      return void (await (await import("@/lib/health/config-store")).saveHealthConfig(normalizeHealthConfig(parsed), actorId));
    }
  }
  throw new Error("unknown config");
}

export async function restoreConfigRevisionAction(revisionId: string, reasonInput: unknown): Promise<Result> {
  await requireAdminAccess();
  if (typeof revisionId !== "string" || !revisionId) return fail("Invalid request");
  const why = parseReason(reasonInput);
  if (!why.ok) return fail(why.error);

  const rev = await db.configRevision.findUnique({ where: { id: revisionId } });
  const entry = rev ? configEntry(rev.key) : undefined;
  if (!rev || !entry) return fail("That version no longer exists");
  const admin = await requireAdminPermission(entry.manage);

  const current = await db.systemSetting.findUnique({ where: { key: rev.key }, select: { value: true } });
  if ((current?.value ?? "") === rev.after) return fail("That is already the current version");
  if (rev.after !== "") {
    try {
      JSON.parse(rev.after);
    } catch {
      return fail("That saved version is damaged and can't be restored");
    }
  }

  try {
    await withRevisionMeta({ reason: why.reason, restoredFromId: rev.id }, () => apply(rev.key, rev.after, admin.id));
  } catch (err) {
    logger.error({ err, key: rev.key }, "config restore failed");
    return fail("Couldn't restore that version. Nothing was changed.");
  }
  await logAudit({ actorId: admin.id, action: "admin.config_restored", targetType: "system", targetId: rev.key, metadata: { revisionId: rev.id, reason: why.reason } });
  revalidatePath("/", "layout");
  revalidatePath("/admin/config-history");
  return { ok: true, message: `${entry.label} restored` };
}
