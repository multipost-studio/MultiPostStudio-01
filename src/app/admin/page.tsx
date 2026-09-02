import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Stat } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { relativeTime, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin overview" };

export default async function AdminOverviewPage() {
  const [users, orgs, workspaces, posts, subs, tickets, events] = await Promise.all([
    db.user.count(),
    db.organization.count(),
    db.workspace.count(),
    db.post.count(),
    db.subscription.findMany({ include: { plan: true } }),
    db.supportTicket.count({ where: { status: { in: ["open", "pending"] } } }),
    db.systemEvent.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
  ]);

  const mrr = subs
    .filter((s) => s.status === "active")
    .reduce((sum, s) => sum + (s.interval === "year" ? s.plan.priceAnnual / 12 : s.plan.priceMonthly), 0);

  const byPlan = subs.reduce<Record<string, number>>((acc, s) => {
    acc[s.plan.name] = (acc[s.plan.name] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-[var(--text)]">Overview</h1>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Users" value={users} />
        <Stat label="Organizations" value={orgs} />
        <Stat label="Workspaces" value={workspaces} />
        <Stat label="Posts" value={formatNumber(posts)} />
        <Stat label="Est. MRR" value={`$${(mrr / 100).toFixed(0)}`} />
        <Stat label="Open tickets" value={tickets} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Subscriptions by plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(byPlan).map(([plan, count]) => (
              <div key={plan} className="flex items-center justify-between text-[14px]">
                <span className="text-[var(--text-muted)]">{plan}</span>
                <span className="font-semibold tabular-nums text-[var(--text)]">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent system events</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-[13px]">
              {events.map((e) => (
                <li key={e.id} className="flex items-start gap-2">
                  <Badge tone={e.level === "error" ? "danger" : e.level === "warn" ? "warning" : "neutral"}>{e.level}</Badge>
                  <span className="flex-1 text-[var(--text-muted)]">
                    <span className="text-[var(--text-subtle)]">[{e.source}]</span> {e.message}
                    <span className="block text-[11px] text-[var(--text-subtle)]">{relativeTime(e.createdAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
