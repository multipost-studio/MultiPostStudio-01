import { cache } from "react";
import { db } from "@/lib/db";
import { NAV } from "@/lib/nav";
import { logger } from "@/lib/logger";
import { orgPlan } from "@/lib/entitlements";
import { normalizeDashboardPrefs, normalizeSidebarPrefs, parseJson, type DashboardPrefs, type SidebarPrefs } from "@/lib/ui-prefs";
import { selectVisiblePromoCards, toPromoCardData, type PromoCardData } from "@/lib/promo-cards";

/**
 * Cards for the signed-in user's sidebar. Never throws: the sidebar is chrome
 * on every page, so a missing table (migration not yet applied) or a DB blip
 * must degrade to "no cards", not a crashed app.
 */
export async function getSidebarPromoCards(userId: string, orgId: string): Promise<PromoCardData[]> {
  try {
    const [cards, dismissals, plan] = await Promise.all([
      db.promoCard.findMany({
        where: { placement: "sidebar", enabled: true, archivedAt: null },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        take: 50,
      }),
      db.promoCardDismissal.findMany({ where: { userId }, select: { cardId: true } }),
      orgPlan(orgId),
    ]);
    const visible = selectVisiblePromoCards(
      cards.map((c) => ({ ...c, tone: c.tone as PromoCardData["tone"] })),
      { placement: "sidebar", planKey: plan.key, dismissedIds: new Set(dismissals.map((d) => d.cardId)) },
    );
    return visible.map(toPromoCardData);
  } catch (err) {
    logger.error({ err }, "getSidebarPromoCards failed");
    return [];
  }
}

const HIDEABLE_GROUPS = NAV.map((g) => g.title).filter(Boolean);

/** Request-memoised: the (app) layout and the dashboard page both read it. */
export const getUserUiPrefs = cache(
  async (userId: string): Promise<{ dashboard: DashboardPrefs; sidebar: SidebarPrefs }> => {
    try {
      const row = await db.userPreference.findUnique({ where: { userId } });
      return {
        dashboard: normalizeDashboardPrefs(parseJson(row?.dashboard)),
        sidebar: normalizeSidebarPrefs(parseJson(row?.sidebar), HIDEABLE_GROUPS),
      };
    } catch (err) {
      logger.error({ err }, "getUserUiPrefs failed");
      return { dashboard: normalizeDashboardPrefs(null), sidebar: normalizeSidebarPrefs(null) };
    }
  },
);
