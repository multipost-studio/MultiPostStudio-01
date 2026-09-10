import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { relativeTime } from "@/lib/utils";
import { queueSide, preview } from "@/lib/support";

export const metadata: Metadata = { title: "Admin · Support" };

/**
 * The support queue. Filters live in the URL so a view can be bookmarked
 * ("open tickets assigned to me"). The default view is everything not yet
 * resolved, newest activity first.
 */

type Search = {
  status?: string;
  kind?: string;
  assignee?: string;
  q?: string;
};

const STATUS_TABS = ["waiting", "open", "pending", "resolved", "closed", "all"] as const;

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? "waiting";
  const kind = sp.kind ?? "all";
  const assignee = sp.assignee ?? "all";
  const q = (sp.q ?? "").trim();

  const where: Record<string, unknown> = {};
  if (status === "waiting") {
    where.status = { in: ["open", "pending"] };
  } else if (status !== "all") {
    where.status = status;
  }
  if (kind !== "all") where.kind = kind;
  if (assignee === "unassigned") where.assignedToId = null;
  else if (assignee !== "all") where.assignedToId = assignee;
  if (q) {
    where.OR = [
      { subject: { contains: q, mode: "insensitive" } },
      { body: { contains: q, mode: "insensitive" } },
      { user: { email: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [tickets, admins, counts] = await Promise.all([
    db.supportTicket.findMany({
      where,
      orderBy: [{ lastReplyAt: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: {
        user: { select: { name: true, email: true } },
        org: { select: { name: true } },
        assignedTo: { select: { name: true, email: true } },
        _count: { select: { messages: true } },
      },
    }),
    db.user.findMany({ where: { isPlatformAdmin: true, deletedAt: null }, select: { id: true, name: true, email: true } }),
    db.supportTicket.groupBy({ by: ["status"], _count: true }),
  ]);

  const waitingCount = counts
    .filter((c) => c.status === "open" || c.status === "pending")
    .reduce((n, c) => n + c._count, 0);

  const qs = (patch: Partial<Search>) => {
    const merged = { status, kind, assignee, q, ...patch };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v && v !== "all" && !(k === "status" && v === "waiting")) p.set(k, String(v));
    const s = p.toString();
    return s ? `/admin/support?${s}` : "/admin/support";
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-[var(--text)]">Support tickets</h1>
        <p className="text-[13px] text-[var(--text-subtle)]">
          <span className="font-semibold text-[var(--text)]">{waitingCount}</span> waiting on us
        </p>
      </div>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
        <div className="flex flex-wrap gap-1">
          {STATUS_TABS.map((s) => {
            const active = status === s;
            return (
              <Link
                key={s}
                href={qs({ status: s })}
                className={`rounded-full px-2.5 py-1 capitalize ${
                  active
                    ? "bg-[var(--primary)] text-white"
                    : "bg-[var(--bg-sunken)] text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                {s === "waiting" ? "Waiting on us" : s}
              </Link>
            );
          })}
        </div>
        <div className="flex items-center gap-1 text-[var(--text-subtle)]">
          <span>Kind:</span>
          {["all", "support", "feedback"].map((k) => (
            <Link key={k} href={qs({ kind: k })} className={`rounded px-1.5 py-0.5 capitalize ${kind === k ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "hover:text-[var(--text)]"}`}>{k}</Link>
          ))}
        </div>
        <div className="flex items-center gap-1 text-[var(--text-subtle)]">
          <span>Owner:</span>
          <Link href={qs({ assignee: "all" })} className={`rounded px-1.5 py-0.5 ${assignee === "all" ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "hover:text-[var(--text)]"}`}>All</Link>
          <Link href={qs({ assignee: "unassigned" })} className={`rounded px-1.5 py-0.5 ${assignee === "unassigned" ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "hover:text-[var(--text)]"}`}>Unassigned</Link>
          {admins.map((a) => (
            <Link key={a.id} href={qs({ assignee: a.id })} className={`rounded px-1.5 py-0.5 ${assignee === a.id ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "hover:text-[var(--text)]"}`}>
              {(a.name ?? a.email).split(" ")[0]}
            </Link>
          ))}
        </div>
        <form action="/admin/support" className="ml-auto">
          <input type="hidden" name="status" value={status === "waiting" ? "" : status} />
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="assignee" value={assignee} />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search subject, body, email…"
            className="w-56 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[13px] text-[var(--text)] outline-none focus:border-[var(--primary)]"
          />
        </form>
      </div>

      {tickets.length === 0 ? (
        <EmptyState title="Nothing here" description="No tickets match this filter." />
      ) : (
        <div className="divide-y divide-[var(--border)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
          {tickets.map((t) => {
            const side = queueSide(t);
            return (
              <Link
                key={t.id}
                href={`/admin/support/${t.id}`}
                className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-[var(--surface-hover)]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {side === "you" && <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--danger)]" title="Waiting on us" />}
                  {side === "them" && <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--text-subtle)]" title="Waiting on the customer" />}
                  <span className="text-[14px] font-semibold text-[var(--text)]">{t.subject}</span>
                  {t.kind === "feedback" && <Badge tone="primary">feedback</Badge>}
                  {(t.priority === "high" || t.priority === "urgent") && <Badge tone="danger">{t.priority}</Badge>}
                  <Badge tone={side === "done" ? "success" : "neutral"}>{t.status}</Badge>
                  {t._count.messages > 0 && (
                    <span className="text-[11px] text-[var(--text-subtle)]">{t._count.messages + 1} messages</span>
                  )}
                </div>
                <p className="text-[13px] text-[var(--text-muted)]">{preview(t.body, 120)}</p>
                <p className="text-[11px] text-[var(--text-subtle)]">
                  {t.user.name} ({t.user.email}) · {t.org?.name ?? "—"} ·{" "}
                  {t.assignedTo ? `owned by ${t.assignedTo.name ?? t.assignedTo.email}` : "unassigned"} ·{" "}
                  {relativeTime(t.lastReplyAt ?? t.createdAt)}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
