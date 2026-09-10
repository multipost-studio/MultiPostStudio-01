import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/session";
import { EmptyState } from "@/components/ui/misc";
import { relativeTime } from "@/lib/utils";
import { getAdminNotifications } from "@/lib/admin-notifications";
import type { SignalPriority } from "@/lib/admin-signals";
import { MarkAllRead, DismissItem } from "./notifications-client";

export const metadata: Metadata = { title: "Admin · Notifications" };

const CHIP: Record<SignalPriority, string> = {
  info: "bg-[var(--bg-sunken)] text-[var(--text-muted)]",
  warn: "bg-[var(--warning-soft)] text-[var(--warning)]",
  critical: "bg-[var(--danger-soft)] text-[var(--danger)]",
};

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  const admin = await requirePlatformAdmin();
  const showAll = (await searchParams).all === "1";
  const { groups, totalUnread } = await getAdminNotifications(admin.id);

  // Default view hides items this admin has already acknowledged (unless the
  // item's condition is persistent and still active — those keep showing).
  const visibleGroups = groups
    .map((g) => ({
      ...g,
      items: showAll ? g.items : g.items.filter((i) => !i.seen || (i.persistent && i.counts)),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text)]">Notifications</h1>
          <p className="text-[13px] text-[var(--text-subtle)]">
            {totalUnread > 0
              ? `${totalUnread} item${totalUnread === 1 ? "" : "s"} need attention`
              : "Everything's handled"}
            {" · "}
            <Link
              href={showAll ? "/admin/notifications" : "/admin/notifications?all=1"}
              className="text-[var(--primary)] hover:underline"
            >
              {showAll ? "Hide cleared" : "Show cleared"}
            </Link>
          </p>
        </div>
        <MarkAllRead disabled={totalUnread === 0} />
      </div>

      {visibleGroups.length === 0 ? (
        <EmptyState
          title={showAll ? "No notifications" : "Nothing needs attention"}
          description={
            showAll
              ? "Signals appear here when something across the platform needs a look."
              : "Broken connections, failed payments, waiting tickets and system errors would show up here."
          }
        />
      ) : (
        <div className="space-y-5">
          {visibleGroups.map((g) => (
            <section key={g.signal.key} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
              <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] ${CHIP[g.signal.priority]}`}>
                  {g.signal.priority}
                </span>
                <span className="text-[14px] font-semibold text-[var(--text)]">{g.signal.title}</span>
                <span className="text-[12px] text-[var(--text-subtle)]">
                  {g.items.length} · {g.signal.module}
                </span>
                {g.signal.persistent && (
                  <span className="ml-auto text-[11px] text-[var(--text-subtle)]">stays until resolved</span>
                )}
              </div>
              <ul className="divide-y divide-[var(--border)]">
                {g.items.map((it) => (
                  <li
                    key={it.key}
                    className={`flex items-start gap-3 px-4 py-2.5 ${it.seen && !it.counts ? "opacity-55" : ""}`}
                  >
                    {!it.seen && (
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)]" title="Unread" />
                    )}
                    <div className="min-w-0 flex-1">
                      <Link href={it.href} className="block text-[14px] text-[var(--text)] hover:text-[var(--primary)]">
                        {it.label}
                      </Link>
                      <p className="text-[11px] text-[var(--text-subtle)]">
                        {relativeTime(it.at)}
                        {it.meta ? ` · ${it.meta}` : ""}
                        {it.seen && it.counts ? " · still open" : ""}
                      </p>
                    </div>
                    <Link
                      href={it.href}
                      className="shrink-0 text-[12px] text-[var(--primary)] hover:underline"
                    >
                      open
                    </Link>
                    <DismissItem itemKey={it.key} seen={it.seen} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
