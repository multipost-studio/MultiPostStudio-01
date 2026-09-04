import { db } from "@/lib/db";
import { getAnalytics, type Range } from "@/lib/analytics";
import { sendNotificationEmail } from "@/lib/adapters/email";
import { appUrl } from "@/lib/env";
import { logger } from "@/lib/logger";

const DAY = 86_400_000;
const nf = (n: number) =>
  Intl.NumberFormat("en-US", { notation: n >= 10000 ? "compact" : "standard" }).format(Math.round(n));
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(0)}%`;
const RANGE_DAYS: Record<string, Range> = { last_7_days: 7, last_30_days: 30, last_90_days: 90 };

function isDue(schedule: string, lastRunAt: Date | null): boolean {
  if (!lastRunAt) return true;
  const age = Date.now() - lastRunAt.getTime();
  return schedule === "monthly" ? age >= 28 * DAY : age >= 7 * DAY;
}

/**
 * Emails every scheduled Report (schedule = weekly | monthly) that's due to
 * the workspace's members, then stamps lastRunAt. Idempotent: the lastRunAt
 * check means running this every cron tick still delivers only once per period.
 */
export async function runDueReports(): Promise<{ reports: number; emails: number }> {
  const reports = await db.report.findMany({
    where: { schedule: { in: ["weekly", "monthly"] } },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
          archived: true,
          members: { select: { user: { select: { id: true, email: true, name: true, deletedAt: true } } } },
        },
      },
    },
  });

  let sent = 0;
  let emails = 0;

  for (const r of reports) {
    if (r.workspace.archived || !isDue(r.schedule!, r.lastRunAt)) continue;

    const recipients = r.workspace.members.map((m) => m.user).filter((u) => !u.deletedAt && u.email);
    if (recipients.length === 0) continue;

    const cfg = (() => {
      try {
        return JSON.parse(r.config) as { dateRange?: string };
      } catch {
        return {};
      }
    })();
    const days = RANGE_DAYS[cfg.dateRange ?? "last_30_days"] ?? 30;

    let a;
    try {
      a = await getAnalytics(r.workspace.id, days);
    } catch (e) {
      logger.warn({ err: e, reportId: r.id }, "scheduled report analytics failed");
      continue;
    }

    const top = a.topPosts[0];
    const body = [
      `"${r.name}" — ${r.workspace.name}, last ${days} days:`,
      ``,
      `• Reach: ${nf(a.totals.reach)} (${pct(a.deltas.reach)})`,
      `• Impressions: ${nf(a.totals.impressions)} (${pct(a.deltas.impressions)})`,
      `• Engagement: ${nf(a.totals.engagement)} (${pct(a.deltas.engagement)})`,
      `• Engagement rate: ${a.engagementRate.toFixed(1)}% (${pct(a.deltas.engagementRate)})`,
      `• Follower growth: ${nf(a.totals.followerGrowth)}`,
      `• Posts published: ${a.postCount}`,
      top ? `• Top post: "${top.title}" — ${top.engagementRate.toFixed(1)}% engagement` : ``,
      ``,
      `Full report and CSV export:`,
    ]
      .filter(Boolean)
      .join("\n");

    for (const u of recipients) {
      try {
        await sendNotificationEmail({
          to: u.email,
          name: u.name,
          title: `${r.schedule === "monthly" ? "Monthly" : "Weekly"} report — ${r.name}`,
          body,
          linkUrl: appUrl(`/analytics/report?range=${days}`),
        });
        emails++;
      } catch (e) {
        logger.warn({ err: e, userId: u.id, reportId: r.id }, "scheduled report email failed");
      }
    }

    await db.report.update({ where: { id: r.id }, data: { lastRunAt: new Date() } });
    sent++;
  }

  return { reports: sent, emails };
}
