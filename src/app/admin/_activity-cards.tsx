import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GroupedAudit, GroupedEvent } from "@/lib/activity-feed";
import { relativeTime } from "@/lib/utils";

/**
 * The Overview "Activity" row. Three equal-height cards, five rows each, a
 * link to the full page for each feed, and one line (two at most) per item, so
 * the row stays tidy no matter how noisy the underlying data is.
 */

function ActivityCard({ title, href, linkLabel, empty, children }: { title: string; href: string; linkLabel: string; empty: string; children: React.ReactNode[] }) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <Link href={href} className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--primary)] hover:underline" aria-label={`${linkLabel}: ${title}`}>
          {linkLabel} <ArrowRight size={13} aria-hidden />
        </Link>
      </CardHeader>
      <CardContent className="flex-1">
        {children.length ? <ul className="divide-y divide-[var(--border)]">{children}</ul> : <p className="py-6 text-center text-[13px] text-[var(--text-subtle)]">{empty}</p>}
      </CardContent>
    </Card>
  );
}

const Row = ({ children }: { children: React.ReactNode }) => <li className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">{children}</li>;

const Count = ({ n }: { n: number }) =>
  n > 1 ? (
    <span className="shrink-0 rounded-full bg-[var(--bg-sunken)] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--text-muted)]" title={`${n} times`}>
      ×{n}
    </span>
  ) : null;

export function ActivityCards({
  users,
  audit,
  events,
}: {
  users: { name: string; email: string; at: string }[];
  audit: GroupedAudit[];
  events: GroupedEvent[];
}) {
  return (
    <div className="grid items-stretch gap-6 lg:grid-cols-3">
      <ActivityCard title="Newest users" href="/admin/users" linkLabel="All users" empty="No sign-ups yet.">
        {users.map((u) => (
          <Row key={u.email}>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-medium text-[var(--text)]">{u.name}</span>
              <span className="block truncate text-[12.5px] text-[var(--text-subtle)]">{u.email}</span>
            </span>
            <time dateTime={u.at} className="shrink-0 text-[12px] text-[var(--text-subtle)]">
              {relativeTime(u.at)}
            </time>
          </Row>
        ))}
      </ActivityCard>

      <ActivityCard title="Recent admin actions" href="/admin/audit" linkLabel="Audit log" empty="No recent admin actions.">
        {audit.map((x) => (
          <Row key={x.id}>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <code className="truncate font-mono text-[12.5px] text-[var(--text)]">{x.action}</code>
                <Count n={x.count} />
              </span>
              <span className="block truncate text-[12px] text-[var(--text-subtle)]">by {x.actor}</span>
            </span>
            <time dateTime={x.at} className="shrink-0 text-[12px] text-[var(--text-subtle)]">
              {relativeTime(x.at)}
            </time>
          </Row>
        ))}
      </ActivityCard>

      <ActivityCard title="System events" href="/admin/observability" linkLabel="All events" empty="No recent system events.">
        {events.map((e) => (
          <Row key={e.id}>
            <Badge tone={e.level === "error" ? "danger" : e.level === "warn" ? "warning" : "neutral"} className="mt-0.5 shrink-0">
              {e.level}
            </Badge>
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 break-words text-[13px] leading-snug text-[var(--text)] [overflow-wrap:anywhere]" title={e.title}>
                {e.title || "(no message)"}
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-[var(--text-subtle)]">
                <span>{e.source}</span>
                <span aria-hidden>·</span>
                <time dateTime={e.at}>{relativeTime(e.at)}</time>
                <Count n={e.count} />
              </span>
            </span>
          </Row>
        ))}
      </ActivityCard>
    </div>
  );
}
