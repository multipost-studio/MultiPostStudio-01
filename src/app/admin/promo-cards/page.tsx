import type { Metadata } from "next";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { parseTargetPlans, type PromoPlacement, type PromoTone } from "@/lib/promo-cards";
import { PromoCardsClient } from "./promo-cards-client";
import type { AdminPromoCard } from "./promo-card-form";

export const metadata: Metadata = { title: "Admin · Promo cards" };
export const dynamic = "force-dynamic";

export default async function AdminPromoCardsPage() {
  let cards: AdminPromoCard[] = [];
  let plans: { key: string; name: string }[] = [];
  let loadError = false;

  try {
    const [rows, planRows] = await Promise.all([
      db.promoCard.findMany({ orderBy: [{ priority: "desc" }, { createdAt: "desc" }] }),
      db.plan.findMany({ select: { key: true, name: true }, orderBy: { sortIndex: "asc" } }),
    ]);
    plans = planRows;
    cards = rows.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      ctaText: c.ctaText,
      ctaUrl: c.ctaUrl,
      icon: c.icon,
      imageUrl: c.imageUrl,
      tone: c.tone as PromoTone,
      placement: c.placement as PromoPlacement,
      priority: c.priority,
      enabled: c.enabled,
      dismissible: c.dismissible,
      startsAt: c.startsAt?.toISOString() ?? null,
      endsAt: c.endsAt?.toISOString() ?? null,
      targetPlans: parseTargetPlans(c.targetPlans),
      impressions: c.impressions,
      clicks: c.clicks,
      archivedAt: c.archivedAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    }));
  } catch (err) {
    logger.error({ err }, "admin promo cards load failed");
    loadError = true;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Promo cards</h1>
        <p className="mt-1 text-[14px] text-[var(--text-muted)]">
          Upgrade prompts, feature announcements and offers shown in users&apos; sidebars. Changes go live on the next page load.
        </p>
      </div>
      {loadError ? (
        <p role="alert" className="rounded-[var(--radius-md)] border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-[14px] text-[var(--danger)]">
          Couldn&apos;t load promo cards. If this is a new deploy, check that the latest database migration has been applied.
        </p>
      ) : (
        <PromoCardsClient cards={cards} plans={plans} />
      )}
    </div>
  );
}
