import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { isTemplateKey } from "@/lib/email-templates";

/**
 * The published override for an email template, if staff have published one. Cached for 30 seconds in each server
 * instance. Never throws: if the table is missing or the database blips, the senders fall back to the built-in text, so
 * a customer's verification or reset email is never lost because of this feature.
 */
export type ActiveTemplate = { subject: string; body: string; version: number };

const TTL_MS = 30_000;
const cache = new Map<string, { at: number; value: ActiveTemplate | null }>();

export function invalidateEmailTemplates(): void {
  cache.clear();
}

export async function activeTemplate(key: string, now: number = Date.now()): Promise<ActiveTemplate | null> {
  if (!isTemplateKey(key)) return null;
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.value;
  try {
    const row = await db.emailTemplateVersion.findFirst({ where: { key, isActive: true }, orderBy: { version: "desc" }, select: { subject: true, body: true, version: true } });
    const value = row ?? null;
    cache.set(key, { at: now, value });
    return value;
  } catch (err) {
    logger.warn({ err, key }, "email template override unreadable; using the built-in text");
    return hit?.value ?? null;
  }
}
