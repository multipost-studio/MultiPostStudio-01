import { db } from "@/lib/db";

/**
 * The admin notification registry.
 *
 * Every entry is a live query against current state — a past-due subscription,
 * a broken connection, an open ticket. Nothing is stored, so a badge clears
 * the instant the underlying thing is resolved. Adding a new notification type
 * is one entry in SIGNALS below: give it a module (matching an ADMIN_NAV
 * label), a priority, and a `load()` that returns the current offending items.
 *
 * `persistent: true` means "this is an unresolved problem": the item keeps
 * counting toward the badge even after an admin marks it read, until the
 * condition itself goes away. Non-persistent items (a new signup, a new org)
 * disappear from the count once acknowledged.
 */

export type SignalPriority = "info" | "warn" | "critical";

/** One offending thing found by a signal. `key` must be stable per occurrence. */
export type SignalItem = {
  key: string;
  label: string;
  href: string;
  at: Date;
  meta?: string;
};

export type AdminSignal = {
  key: string;
  /** Must exactly match a label in ADMIN_NAV so the sidebar can map the badge. */
  module: string;
  title: string;
  priority: SignalPriority;
  persistent?: boolean;
  load: () => Promise<SignalItem[]>;
};

const DAY = 86_400_000;
const HOUR = 3_600_000;
const now = () => Date.now();

/** Cap every signal so a pathological state can't make the query unbounded. */
const CAP = 50;

export const SIGNALS: AdminSignal[] = [
  /* ---------------- Support ---------------- */
  {
    key: "support.waiting",
    module: "Support",
    title: "Tickets waiting on us",
    priority: "warn",
    persistent: true,
    async load() {
      const rows = await db.supportTicket.findMany({
        where: { status: { in: ["open", "pending"] }, NOT: { lastReplyRole: "staff" } },
        orderBy: { lastReplyAt: "asc" },
        take: CAP,
        select: { id: true, subject: true, lastReplyAt: true, createdAt: true },
      });
      return rows.map((t) => ({
        key: `support.waiting:${t.id}:${(t.lastReplyAt ?? t.createdAt).getTime()}`,
        label: t.subject,
        href: `/admin/support/${t.id}`,
        at: t.lastReplyAt ?? t.createdAt,
      }));
    },
  },
  {
    key: "support.unassigned",
    module: "Support",
    title: "Unassigned tickets",
    priority: "info",
    persistent: true,
    async load() {
      const rows = await db.supportTicket.findMany({
        where: {
          status: { in: ["open", "pending"] },
          assignedToId: null,
          createdAt: { lt: new Date(now() - 2 * HOUR) },
        },
        orderBy: { createdAt: "asc" },
        take: CAP,
        select: { id: true, subject: true, createdAt: true },
      });
      return rows.map((t) => ({
        key: `support.unassigned:${t.id}`,
        label: t.subject,
        href: `/admin/support/${t.id}`,
        at: t.createdAt,
        meta: "no owner",
      }));
    },
  },

  /* ---------------- Billing ---------------- */
  {
    key: "billing.past_due",
    module: "Billing",
    title: "Past-due subscriptions",
    priority: "critical",
    persistent: true,
    async load() {
      const rows = await db.subscription.findMany({
        where: { status: "past_due" },
        orderBy: { currentPeriodEnd: "asc" },
        take: CAP,
        select: { orgId: true, currentPeriodEnd: true, org: { select: { name: true } } },
      });
      return rows.map((s) => ({
        key: `billing.past_due:${s.orgId}`,
        label: `${s.org.name} — payment failed`,
        href: `/admin/billing`,
        at: s.currentPeriodEnd,
      }));
    },
  },
  {
    key: "billing.open_invoice",
    module: "Billing",
    title: "Unpaid invoices",
    priority: "warn",
    persistent: true,
    async load() {
      const rows = await db.invoice.findMany({
        where: { status: "open", createdAt: { lt: new Date(now() - 3 * DAY) } },
        orderBy: { createdAt: "asc" },
        take: CAP,
        select: { id: true, number: true, createdAt: true, org: { select: { name: true } } },
      });
      return rows.map((i) => ({
        key: `billing.open_invoice:${i.id}`,
        label: `${i.org.name} — invoice ${i.number} unpaid`,
        href: `/admin/billing`,
        at: i.createdAt,
      }));
    },
  },
  {
    key: "billing.trial_ending",
    module: "Billing",
    title: "Trials ending soon",
    priority: "info",
    async load() {
      const soon = new Date(now() + 3 * DAY);
      const rows = await db.subscription.findMany({
        where: { status: "trialing", trialEndsAt: { not: null, lte: soon, gte: new Date() } },
        orderBy: { trialEndsAt: "asc" },
        take: CAP,
        select: { orgId: true, trialEndsAt: true, org: { select: { name: true } } },
      });
      return rows.map((s) => ({
        key: `billing.trial_ending:${s.orgId}:${s.trialEndsAt!.toDateString()}`,
        label: `${s.org.name} — trial ends ${s.trialEndsAt!.toLocaleDateString()}`,
        href: `/admin/orgs`,
        at: s.trialEndsAt!,
      }));
    },
  },

  /* ---------------- Connections ---------------- */
  {
    key: "connections.social_broken",
    module: "Connections",
    title: "Broken social connections",
    priority: "warn",
    persistent: true,
    async load() {
      const rows = await db.socialAccount.findMany({
        where: { status: { in: ["error", "expired"] } },
        orderBy: { connectedAt: "desc" },
        take: CAP,
        select: {
          id: true, platform: true, handle: true, status: true, connectedAt: true,
          workspace: { select: { name: true } },
        },
      });
      return rows.map((a) => ({
        key: `connections.social_broken:${a.id}:${a.status}`,
        label: `${a.platform} ${a.handle} (${a.workspace.name}) — ${a.status}`,
        href: `/admin/connections`,
        at: a.connectedAt,
      }));
    },
  },
  {
    key: "connections.integration_broken",
    module: "Connections",
    title: "Broken app integrations",
    priority: "info",
    persistent: true,
    async load() {
      const rows = await db.connectedIntegration.findMany({
        where: { status: { in: ["error", "expired"] } },
        orderBy: { connectedAt: "desc" },
        take: CAP,
        select: { id: true, provider: true, status: true, connectedAt: true, workspace: { select: { name: true } } },
      });
      return rows.map((c) => ({
        key: `connections.integration_broken:${c.id}:${c.status}`,
        label: `${c.provider} (${c.workspace.name}) — ${c.status}`,
        href: `/admin/connections`,
        at: c.connectedAt,
      }));
    },
  },

  /* ---------------- System Health ---------------- */
  {
    key: "system.errors",
    module: "System Health",
    title: "System errors (24h)",
    priority: "critical",
    async load() {
      const rows = await db.systemEvent.findMany({
        where: { level: "error", createdAt: { gte: new Date(now() - DAY) } },
        orderBy: { createdAt: "desc" },
        take: CAP,
        select: { id: true, source: true, message: true, createdAt: true },
      });
      return rows.map((e) => ({
        key: `system.errors:${e.id}`,
        label: `[${e.source}] ${e.message.slice(0, 120)}`,
        href: `/admin/system`,
        at: e.createdAt,
      }));
    },
  },
  {
    key: "system.webhook_failures",
    module: "System Health",
    title: "Failed webhook deliveries (24h)",
    priority: "warn",
    async load() {
      const rows = await db.webhookDelivery.findMany({
        where: { success: false, createdAt: { gte: new Date(now() - DAY) } },
        orderBy: { createdAt: "desc" },
        take: CAP,
        select: { id: true, event: true, statusCode: true, createdAt: true, webhook: { select: { url: true } } },
      });
      return rows.map((d) => ({
        key: `system.webhook_failures:${d.id}`,
        label: `${d.event} → ${d.webhook.url.slice(0, 60)} (${d.statusCode ?? "no response"})`,
        href: `/admin/usage`,
        at: d.createdAt,
      }));
    },
  },

  /* ---------------- Posts ---------------- */
  {
    key: "posts.publish_failures",
    module: "Posts",
    title: "Publish failures (24h)",
    priority: "warn",
    async load() {
      const rows = await db.publishJob.findMany({
        where: { status: "failed", finishedAt: { gte: new Date(now() - DAY) } },
        orderBy: { finishedAt: "desc" },
        take: CAP,
        select: {
          id: true, lastError: true, finishedAt: true, createdAt: true,
          post: { select: { title: true, workspace: { select: { name: true } } } },
        },
      });
      return rows.map((j) => ({
        key: `posts.publish_failures:${j.id}`,
        label: `${j.post.title ?? "Untitled"} (${j.post.workspace.name})`,
        href: `/admin/posts`,
        at: j.finishedAt ?? j.createdAt,
        meta: j.lastError?.slice(0, 100),
      }));
    },
  },

  /* ---------------- Users ---------------- */
  {
    key: "users.new",
    module: "Users",
    title: "New signups (24h)",
    priority: "info",
    async load() {
      const rows = await db.user.findMany({
        where: { createdAt: { gte: new Date(now() - DAY) }, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: CAP,
        select: { id: true, name: true, email: true, emailVerified: true, createdAt: true },
      });
      return rows.map((u) => ({
        key: `users.new:${u.id}`,
        label: `${u.name || u.email}${u.emailVerified ? "" : " — unverified"}`,
        href: `/admin/users`,
        at: u.createdAt,
      }));
    },
  },

  /* ---------------- Organizations ---------------- */
  {
    key: "orgs.new",
    module: "Organizations",
    title: "New organizations (24h)",
    priority: "info",
    async load() {
      const rows = await db.organization.findMany({
        where: { createdAt: { gte: new Date(now() - DAY) }, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: CAP,
        select: { id: true, name: true, type: true, createdAt: true },
      });
      return rows.map((o) => ({
        key: `orgs.new:${o.id}`,
        label: `${o.name} · ${o.type}`,
        href: `/admin/orgs`,
        at: o.createdAt,
      }));
    },
  },

  /* ---------------- Referrals ---------------- */
  {
    key: "referrals.unrewarded",
    module: "Referrals",
    title: "Converted referrals not yet rewarded",
    priority: "info",
    persistent: true,
    async load() {
      const rows = await db.referral.findMany({
        where: {
          status: "converted",
          OR: [{ rewardedReferrer: false }, { rewardedReferee: false }],
        },
        orderBy: { convertedAt: "desc" },
        take: CAP,
        select: { id: true, convertedAt: true, createdAt: true, referrer: { select: { email: true } } },
      });
      return rows.map((r) => ({
        key: `referrals.unrewarded:${r.id}`,
        label: `${r.referrer.email} — reward pending`,
        href: `/admin/referrals`,
        at: r.convertedAt ?? r.createdAt,
      }));
    },
  },

  /* ---------------- Audit Log ---------------- */
  {
    key: "audit.sensitive",
    module: "Audit Log",
    title: "Sensitive admin actions (24h)",
    priority: "warn",
    async load() {
      // Real action strings emitted by src/app/actions/admin.ts.
      const SENSITIVE = [
        "admin.user_deleted",
        "admin.org_deleted",
        "admin.plan_deleted",
        "admin.plan_updated",
        "admin.user_admin_changed",
        "admin.org_plan_set",
        "admin.broadcast_sent",
      ];
      const rows = await db.auditLog.findMany({
        where: { action: { in: SENSITIVE }, createdAt: { gte: new Date(now() - DAY) } },
        orderBy: { createdAt: "desc" },
        take: CAP,
        select: { id: true, action: true, targetType: true, targetId: true, createdAt: true, actor: { select: { name: true, email: true } } },
      });
      return rows.map((a) => ({
        key: `audit.sensitive:${a.id}`,
        label: `${a.actor?.name ?? a.actor?.email ?? "system"} — ${a.action.replace(/^admin\./, "").replace(/_/g, " ")}`,
        href: `/admin/audit`,
        at: a.createdAt,
        meta: `${a.targetType} ${a.targetId.slice(0, 8)}`,
      }));
    },
  },
];

/** Signal lookup by key, for the read-state layer. */
export const SIGNAL_BY_KEY: Record<string, AdminSignal> = Object.fromEntries(
  SIGNALS.map((s) => [s.key, s]),
);

/** The signal a given item key belongs to (item keys are `<signalKey>:<...>`). */
export function signalForItemKey(itemKey: string): AdminSignal | undefined {
  // Signal keys contain exactly one dot ("billing.past_due"); item keys append
  // ":<id>...". Match on the longest signal key that prefixes the item key.
  for (const s of SIGNALS) {
    if (itemKey === s.key || itemKey.startsWith(`${s.key}:`)) return s;
  }
  return undefined;
}
