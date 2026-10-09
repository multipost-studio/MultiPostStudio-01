"use server";

import { revalidatePath } from "next/cache";
import { requireAdminPermission } from "@/lib/session";
import { logAudit } from "@/lib/events";
import { logger } from "@/lib/logger";
import { DEFAULT_FOOTER_CONFIG, MAX_IMPORT_BYTES, parseFooterConfig, type FooterConfig } from "@/lib/footer/config";
import { FOOTER_CONFIG_KEY, loadFooterConfig, resetFooterConfig, saveFooterConfig } from "@/lib/footer/store";

export type FooterConfigResult = { ok: true; config: FooterConfig; message: string } | { ok: false; errors: string[] };

async function apply(config: FooterConfig, actorId: string, action: string, message: string): Promise<FooterConfigResult> {
  const before = await loadFooterConfig();
  await saveFooterConfig(config, actorId);
  await logAudit({ actorId, action, targetType: "system", targetId: FOOTER_CONFIG_KEY, metadata: { before, after: config } });
  // The footer is on every marketing page: refresh them all.
  revalidatePath("/", "layout");
  revalidatePath("/admin/footer");
  return { ok: true, config, message };
}

function isRedirect(err: unknown): boolean {
  return typeof err === "object" && err !== null && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");
}

/** Save the whole footer. Validated strictly: nothing is saved if anything is wrong. */
export async function saveFooterConfigAction(input: unknown): Promise<FooterConfigResult> {
  try {
    const admin = await requireAdminPermission("marketing.manage");
    const parsed = parseFooterConfig(input);
    if (!parsed.ok) return parsed;
    return await apply(parsed.config, admin.id, "admin.footer_config_updated", "Footer saved");
  } catch (err) {
    if (isRedirect(err)) throw err;
    logger.error({ err }, "save footer config failed");
    return { ok: false, errors: ["Couldn't save the footer."] };
  }
}

/** Import a footer exported from this page (or another environment). All-or-nothing. */
export async function importFooterConfigAction(text: string): Promise<FooterConfigResult> {
  try {
    const admin = await requireAdminPermission("marketing.manage");
    if (typeof text !== "string" || text.length === 0) return { ok: false, errors: ["The file is empty."] };
    if (text.length > MAX_IMPORT_BYTES) return { ok: false, errors: [`The file is larger than ${MAX_IMPORT_BYTES / 1000} KB.`] };
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return { ok: false, errors: ["The file is not valid JSON."] };
    }
    const candidate = raw && typeof raw === "object" && "config" in raw && !("columns" in raw) ? (raw as { config: unknown }).config : raw;
    const parsed = parseFooterConfig(candidate);
    if (!parsed.ok) return parsed;
    return await apply(parsed.config, admin.id, "admin.footer_config_imported", "Footer imported");
  } catch (err) {
    if (isRedirect(err)) throw err;
    logger.error({ err }, "import footer config failed");
    return { ok: false, errors: ["Couldn't save the imported footer."] };
  }
}

/** Back to the built-in footer. */
export async function resetFooterConfigAction(): Promise<FooterConfigResult> {
  try {
    const admin = await requireAdminPermission("marketing.manage");
    const before = await loadFooterConfig();
    await resetFooterConfig();
    await logAudit({ actorId: admin.id, action: "admin.footer_config_reset", targetType: "system", targetId: FOOTER_CONFIG_KEY, metadata: { before } });
    revalidatePath("/", "layout");
    revalidatePath("/admin/footer");
    return { ok: true, config: DEFAULT_FOOTER_CONFIG, message: "Footer reset to the default" };
  } catch (err) {
    if (isRedirect(err)) throw err;
    logger.error({ err }, "reset footer config failed");
    return { ok: false, errors: ["Couldn't reset the footer."] };
  }
}
