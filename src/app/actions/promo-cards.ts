"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser, requireAdminPermission } from "@/lib/session";
import { logAudit } from "@/lib/events";
import { logger } from "@/lib/logger";
import { promoCardSchema, promoStatus, type PromoCardInput } from "@/lib/promo-cards";
import { STARTER_TEMPLATES, templateToInput } from "@/lib/promo-templates";

export type PromoResult = { ok: true; id?: string; url?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function refresh() {
  revalidatePath("/admin/promo-cards");
  // Sidebars are rendered by the (app) layout — make the next navigation pick changes up.
  revalidatePath("/", "layout");
}

function parse(input: PromoCardInput): { ok: true; data: ReturnType<typeof promoCardSchema.parse> } | Extract<PromoResult, { ok: false }> {
  const r = promoCardSchema.safeParse(input);
  if (r.success) return { ok: true, data: r.data };
  const fieldErrors: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] ??= issue.message;
  }
  return { ok: false, error: Object.values(fieldErrors)[0] ?? "Invalid card", fieldErrors };
}

async function assertOwnImage(url: string | null): Promise<string | null> {
  if (!url || url.startsWith("/uploads/")) return null;
  const { isOwnStorageUrl } = await import("@/lib/adapters/storage");
  return isOwnStorageUrl(url) ? null : "Upload the image instead of linking to another site.";
}

const dbData = (d: ReturnType<typeof promoCardSchema.parse>) => ({
  title: d.title,
  description: d.description,
  ctaText: d.ctaText,
  ctaUrl: d.ctaUrl,
  icon: d.icon,
  imageUrl: d.imageUrl,
  tone: d.tone,
  placement: d.placement,
  priority: d.priority,
  enabled: d.enabled,
  dismissible: d.dismissible,
  startsAt: d.startsAt,
  endsAt: d.endsAt,
  targetPlans: JSON.stringify(d.targetPlans),
  targetAudience: JSON.stringify(d.targetAudience),
});

/* ---------------- Admin ---------------- */

export async function createPromoCardAction(input: PromoCardInput): Promise<PromoResult> {
  const admin = await requireAdminPermission("marketing.manage");
  const p = parse(input);
  if (!p.ok) return p;
  const imgErr = await assertOwnImage(p.data.imageUrl);
  if (imgErr) return { ok: false, error: imgErr, fieldErrors: { imageUrl: imgErr } };
  try {
    const card = await db.promoCard.create({ data: { ...dbData(p.data), createdById: admin.id } });
    await logAudit({ actorId: admin.id, action: "promo_card.create", targetType: "PromoCard", targetId: card.id, metadata: { title: card.title } });
    refresh();
    return { ok: true, id: card.id };
  } catch (err) {
    logger.error({ err }, "createPromoCardAction failed");
    return { ok: false, error: "Couldn't save the card. Please try again." };
  }
}

export async function updatePromoCardAction(id: string, input: PromoCardInput): Promise<PromoResult> {
  const admin = await requireAdminPermission("marketing.manage");
  const p = parse(input);
  if (!p.ok) return p;
  const imgErr = await assertOwnImage(p.data.imageUrl);
  if (imgErr) return { ok: false, error: imgErr, fieldErrors: { imageUrl: imgErr } };
  try {
    const card = await db.promoCard.update({ where: { id }, data: dbData(p.data) });
    await logAudit({ actorId: admin.id, action: "promo_card.update", targetType: "PromoCard", targetId: id, metadata: { title: card.title } });
    refresh();
    return { ok: true, id };
  } catch (err) {
    logger.error({ err, id }, "updatePromoCardAction failed");
    return { ok: false, error: "Couldn't save the card. It may have been deleted." };
  }
}

export async function setPromoCardEnabledAction(id: string, enabled: boolean): Promise<PromoResult> {
  const admin = await requireAdminPermission("marketing.manage");
  try {
    await db.promoCard.update({ where: { id }, data: { enabled } });
    await logAudit({ actorId: admin.id, action: enabled ? "promo_card.enable" : "promo_card.disable", targetType: "PromoCard", targetId: id });
    refresh();
    return { ok: true, id };
  } catch (err) {
    logger.error({ err, id }, "setPromoCardEnabledAction failed");
    return { ok: false, error: "Couldn't update the card." };
  }
}

/** Archived cards stop showing immediately and keep their stats; they can be restored. */
export async function archivePromoCardAction(id: string, archived: boolean): Promise<PromoResult> {
  const admin = await requireAdminPermission("marketing.manage");
  try {
    await db.promoCard.update({ where: { id }, data: archived ? { archivedAt: new Date(), enabled: false } : { archivedAt: null } });
    await logAudit({ actorId: admin.id, action: archived ? "promo_card.archive" : "promo_card.restore", targetType: "PromoCard", targetId: id });
    refresh();
    return { ok: true, id };
  } catch (err) {
    logger.error({ err, id }, "archivePromoCardAction failed");
    return { ok: false, error: "Couldn't update the card." };
  }
}

export async function deletePromoCardAction(id: string): Promise<PromoResult> {
  const admin = await requireAdminPermission("marketing.manage");
  try {
    const card = await db.promoCard.delete({ where: { id } });
    await logAudit({ actorId: admin.id, action: "promo_card.delete", targetType: "PromoCard", targetId: id, metadata: { title: card.title } });
    refresh();
    return { ok: true };
  } catch (err) {
    logger.error({ err, id }, "deletePromoCardAction failed");
    return { ok: false, error: "Couldn't delete the card." };
  }
}

export async function uploadPromoImageAction(formData: FormData): Promise<PromoResult> {
  await requireAdminPermission("marketing.manage");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose an image to upload." };
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return { ok: false, error: "Use a PNG, JPG, WebP or GIF image." };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "Image must be 2 MB or smaller." };
  try {
    const { saveUpload } = await import("@/lib/adapters/storage");
    const saved = await saveUpload(file);
    return { ok: true, url: saved.url };
  } catch (err) {
    logger.error({ err }, "uploadPromoImageAction failed");
    return { ok: false, error: err instanceof Error ? err.message : "Upload failed" };
  }
}

/**
 * One-click starter set for an empty list, built from the shared template
 * library (links and copy verified there). Inserted paused so an admin reviews
 * copy and targeting before anything reaches users. Never includes templates
 * that depend on a feature switch (e.g. the affiliate program).
 */
export async function seedStarterPromoCardsAction(): Promise<PromoResult> {
  const admin = await requireAdminPermission("marketing.manage");
  try {
    if ((await db.promoCard.count()) > 0) return { ok: false, error: "Cards already exist." };
    await db.promoCard.createMany({
      data: STARTER_TEMPLATES.map((t) => {
        const parsed = promoCardSchema.parse(templateToInput(t));
        return { ...dbData(parsed), createdById: admin.id };
      }),
    });
    await logAudit({ actorId: admin.id, action: "promo_card.seed", targetType: "PromoCard", targetId: "starter" });
    refresh();
    return { ok: true };
  } catch (err) {
    logger.error({ err }, "seedStarterPromoCardsAction failed");
    return { ok: false, error: "Couldn't add starter cards." };
  }
}

/* ---------------- Signed-in users ---------------- */

// The two user-facing actions below fire in the background from the sidebar.
// They use getCurrentUser (not requireUser) so an expired session fails quietly
// instead of redirecting the page to /login mid-use.
export async function dismissPromoCardAction(id: string): Promise<PromoResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  try {
    const card = await db.promoCard.findUnique({ where: { id }, select: { dismissible: true } });
    if (!card?.dismissible) return { ok: false, error: "This card can't be dismissed." };
    await db.promoCardEngagement.upsert({
      where: { cardId_userId: { cardId: id, userId: user.id } },
      create: { cardId: id, userId: user.id, dismissedAt: new Date() },
      update: { dismissedAt: new Date() },
    });
    return { ok: true };
  } catch (err) {
    logger.error({ err, id }, "dismissPromoCardAction failed");
    return { ok: false, error: "Couldn't dismiss the card." };
  }
}

/**
 * Basic analytics, counted per unique user: the counter only moves the first
 * time a given user views / clicks a card (compare-and-set on the engagement
 * row), so refreshes, repeat clicks and scripted calls can't inflate it.
 * Only live cards count, so stale tabs can't inflate a paused card either.
 */
export async function trackPromoCardAction(id: string, kind: "impression" | "click"): Promise<void> {
  if (kind !== "impression" && kind !== "click") return;
  const user = await getCurrentUser();
  if (!user) return;
  try {
    const card = await db.promoCard.findUnique({ where: { id }, select: { enabled: true, archivedAt: true, startsAt: true, endsAt: true } });
    if (!card || promoStatus(card) !== "live") return;

    // A concurrent first call may win the create; the unique key makes the loser harmless.
    await db.promoCardEngagement
      .upsert({ where: { cardId_userId: { cardId: id, userId: user.id } }, create: { cardId: id, userId: user.id }, update: {} })
      .catch(() => {});

    const mark = kind === "impression" ? { viewedAt: null } : { clickedAt: null };
    const set = kind === "impression" ? { viewedAt: new Date() } : { clickedAt: new Date() };
    const first = await db.promoCardEngagement.updateMany({ where: { cardId: id, userId: user.id, ...mark }, data: set });
    if (first.count > 0) {
      await db.promoCard.update({
        where: { id },
        data: kind === "impression" ? { impressions: { increment: 1 } } : { clicks: { increment: 1 } },
      });
    }
  } catch (err) {
    logger.error({ err, id, kind }, "trackPromoCardAction failed");
  }
}
