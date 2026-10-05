import { cache } from "react";
import { db } from "@/lib/db";
import { NAV } from "@/lib/nav";
import { logger } from "@/lib/logger";
import { orgPlan } from "@/lib/entitlements";
import { normalizeDashboardPrefs, normalizeSidebarPrefs, parseJson, type DashboardPrefs, type SidebarPrefs } from "@/lib/ui-prefs";
import { selectVisiblePromoCards, toPromoCardData, type PromoCardData, type PromoPlacement } from "@/lib/promo-cards";

/**
 * Cards for one placement, already filtered for this user. Never throws:
 * promos are chrome, so a missing table (migration not yet applied) or a DB
 * blip must degrade to "no cards", not a crashed page.
 */
export async function getPromoCards(userId: string, orgId: string, placement: PromoPlacement): Promise<PromoCardData[]> {
  try {
    const [cards, dismissals, plan] = await Promise.all([
      db.promoCard.findMany({
        where: { placement, enabled: true, archivedAt: null },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        take: 50,
      }),
      db.promoCardEngagement.findMany({ where: { userId, dismissedAt: { not: null } }, select: { cardId: true } }),
      orgPlan(orgId),
    ]);
    const visible = selectVisiblePromoCards(
      cards.map((c) => ({ ...c, tone: c.tone as PromoCardData["tone"] })),
      { placement, planKey: plan.key, dismissedIds: new Set(dismissals.map((d) => d.cardId)) },
    );
    return visible.map(toPromoCardData);
  } catch (err) {
    logger.error({ err, placement }, "getPromoCards failed");
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
