import { db } from "@/lib/db";
import { getAnalytics } from "@/lib/analytics";
import { sendNotificationEmail } from "@/lib/adapters/email";
import { appUrl } from "@/lib/env";
import { logger } from "@/lib/logger";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const nf = (n: number) => Intl.NumberFormat("en-US", { notation: n >= 10000 ? "compact" : "standard" }).format(Math.round(n));
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(0)}%`;

/**
 * Weekly per-workspace performance digest, emailed to members whose
 * NotificationPref.emailWeeklyDigest is on. Returns a run summary.
 */
export async function sendWeeklyDigests(opts?: { force?: boolean }): Promise<{ workspaces: number; emails: number; skipped?: string }> {
  // Idempotency guard — the digest is emitted from GitHub Actions and can retry.
  const today = new Date().toISOString().slice(0, 10);
  if (!opts?.force) {
    const last = await db.systemSetting.findUnique({ where: { key: "digest_last_sent" } });
    if (last && JSON.parse(last.value) === today) {
      return { workspaces: 0, emails: 0, skipped: "already sent today" };
    }
  }
  await db.systemSetting.upsert({
    where: { key: "digest_last_sent" },
    create: { key: "digest_last_sent", value: JSON.stringify(today) },
    update: { value: JSON.stringify(today) },
  });

  const workspaces = await db.workspace.findMany({
    where: { archived: false },
    select: {
      id: true,
      name: true,
      members: {
        select: { user: { select: { id: true, email: true, name: true, deletedAt: true, notificationPref: true } } },
      },
    },
  });

  let emails = 0;
  let touched = 0;

  for (const ws of workspaces) {
    const recipients = ws.members
      .map((m) => m.user)
      .filter((u) => !u.deletedAt && (u.notificationPref?.emailWeeklyDigest ?? true));
    if (recipients.length === 0) continue;

    let a;
    try {
      a = await getAnalytics(ws.id, 7);
    } catch (e) {
      logger.warn({ err: e, wsId: ws.id }, "digest analytics failed");
      continue;
    }
    if (a.postCount === 0 && a.totals.impressions === 0) continue; // nothing to report

    const best = a.bestSlots[0];
    const top = a.topPosts[0];
    const body = [
      `Here's how ${ws.name} did over the last 7 days:`,
      ``,
      `• Reach: ${nf(a.totals.reach)} (${pct(a.deltas.reach)})`,
      `• Impressions: ${nf(a.totals.impressions)} (${pct(a.deltas.impressions)})`,
      `• Engagement: ${nf(a.totals.engagement)} (${pct(a.deltas.engagement)})`,
      `• Engagement rate: ${a.engagementRate.toFixed(1)}% (${pct(a.deltas.engagementRate)})`,
      `• Follower growth: ${nf(a.totals.followerGrowth)}`,
      `• Posts published: ${a.postCount}`,
      best ? `• Best time to post: ${DOW[best.day]} ${best.hour}:00` : ``,
      top ? `• Top post: "${top.title}" — ${top.engagementRate.toFixed(1)}% engagement` : ``,
    ]
      .filter(Boolean)
      .join("\n");

    touched++;
    for (const u of recipients) {
      try {
        await sendNotificationEmail({
          to: u.email,
          name: u.name,
          title: `Your weekly digest — ${ws.name}`,
          body,
          linkUrl: appUrl("/analytics"),
        });
        emails++;
      } catch (e) {
        logger.warn({ err: e, userId: u.id }, "digest email failed");
      }
    }
  }

  return { workspaces: touched, emails };
}
