"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BellOff, CheckCheck, Loader2, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationItem } from "@/components/notifications/notification-item";
import { dayGroup } from "@/components/notifications/notification-meta";
import { useNotificationFeed, type Feed } from "@/components/notifications/use-notification-feed";
import type { NotificationDTO, NotificationFilter } from "@/lib/notifications/service";

const TABS: { id: NotificationFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "read", label: "Read" },
  { id: "publishing", label: "Publishing" },
  { id: "scheduling", label: "Scheduling" },
  { id: "engagement", label: "Engagement" },
  { id: "mentions", label: "Mentions" },
  { id: "team", label: "Team" },
  { id: "account", label: "Account" },
  { id: "billing", label: "Billing" },
  { id: "system", label: "System" },
];

const EMPTY: Partial<Record<NotificationFilter, string>> = {
  all: "Nothing here yet. Publishing results, reminders and team activity will appear as they happen.",
  unread: "You're all caught up. Nothing is waiting for you.",
  read: "Notifications you've read will stay here for a while.",
  publishing: "No publishing activity yet.",
  scheduling: "No reminders or schedule alerts yet.",
  engagement: "No milestones yet. They appear when a post or your streak hits one.",
  mentions: "Nobody has mentioned you or commented on your posts yet.",
  team: "No approvals or team activity.",
  account: "No account or security alerts.",
  billing: "No billing notices.",
  system: "No announcements.",
};

export function NotificationCenter({ initial, initialFilter }: { initial: Feed; initialFilter: NotificationFilter }) {
  const router = useRouter();
  const [filter, setFilter] = useState<NotificationFilter>(initialFilter);
  const [query, setQuery] = useState("");
  const feed = useNotificationFeed({ filter, q: query.trim(), initial, initialFilter });

  const groups = useMemo(() => {
    const out: { label: string; items: NotificationDTO[] }[] = [];
    for (const n of feed.items) {
      const label = dayGroup(n.createdAt);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(n);
      else out.push({ label, items: [n] });
    }
    return out;
  }, [feed.items]);

  const onOpen = (n: NotificationDTO) => {
    feed.markRead(n);
    if (n.linkUrl === window.location.pathname) router.refresh();
  };

  const loadingFirst = feed.status === "loading" && feed.items.length === 0;
  const searching = query.trim().length > 0;

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
    setFilter(next.id);
    (e.currentTarget.parentElement?.querySelector(`[data-tab="${next.id}"]`) as HTMLElement | null)?.focus();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div role="tablist" aria-label="Filter notifications" className="-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              data-tab={t.id}
              aria-selected={filter === t.id}
              tabIndex={filter === t.id ? 0 : -1}
              onClick={() => setFilter(t.id)}
              onKeyDown={(e) => onTabKey(e, i)}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[var(--ring)]",
                filter === t.id ? "bg-[var(--text)] text-[var(--bg-elevated)]" : "border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
              )}
            >
              {t.label}
              {t.id === "unread" && feed.unread > 0 && (
                <span className={cn("rounded-full px-1.5 text-[11px] font-bold leading-[18px]", filter === t.id ? "bg-[var(--bg-elevated)] text-[var(--text)]" : "bg-[var(--primary)] text-[var(--primary-text)]")}>
                  {feed.unread > 99 ? "99+" : feed.unread}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="relative block min-w-0 flex-1 sm:max-w-sm">
            <span className="sr-only">Search notifications</span>
            <Search size={14} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notifications"
              maxLength={100}
              className="h-9 w-full rounded-full border border-[var(--border)] bg-[var(--surface)] pl-8 pr-3 text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--primary)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            />
          </label>
          <button
            type="button"
            onClick={feed.markAll}
            disabled={feed.unread === 0}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[var(--border-strong)] px-3.5 text-[13px] font-medium text-[var(--text)] hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--ring)] disabled:pointer-events-none disabled:opacity-40"
          >
            <CheckCheck size={14} aria-hidden /> <span className="hidden sm:inline">Mark all as read</span>
            <span className="sm:hidden">All read</span>
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]" aria-live="polite" aria-busy={loadingFirst}>
        {loadingFirst ? (
          <ul aria-label="Loading notifications" className="divide-y divide-[var(--border)]">
            {[0, 1, 2, 3, 4].map((i) => (
              <li key={i} className="flex gap-3 px-4 py-4">
                <span className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-[var(--surface-hover)]" />
                <span className="flex-1 space-y-2 pt-1">
                  <span className="block h-3 w-1/2 animate-pulse rounded bg-[var(--surface-hover)]" />
                  <span className="block h-3 w-4/5 animate-pulse rounded bg-[var(--surface-hover)]" />
                </span>
              </li>
            ))}
          </ul>
        ) : feed.status === "error" && feed.items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <p className="text-[15px] font-semibold text-[var(--text)]">Couldn&apos;t load notifications</p>
            <p className="text-[14px] text-[var(--text-muted)]">Check your connection and try again.</p>
            <button
              type="button"
              onClick={() => void feed.reload()}
              className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--border-strong)] px-4 text-[13px] font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
            >
              <RefreshCw size={14} aria-hidden /> Try again
            </button>
          </div>
        ) : feed.items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-hover)] text-[var(--text-subtle)]">
              <BellOff size={22} aria-hidden />
            </span>
            <p className="text-[15px] font-semibold text-[var(--text)]">{searching ? "No matches" : filter === "unread" ? "All caught up" : "No notifications"}</p>
            <p className="max-w-[40ch] text-[14px] text-[var(--text-muted)]">{searching ? `Nothing matches “${query.trim()}”.` : EMPTY[filter]}</p>
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.label} aria-label={g.label}>
              <h2 className="border-b border-[var(--border)] bg-[var(--surface-hover)]/50 px-4 py-1.5 text-[12px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">{g.label}</h2>
              <ul>
                {g.items.map((n) => (
                  <NotificationItem key={n.id} n={n} roomy onOpen={onOpen} onToggleRead={feed.toggleRead} onDelete={feed.remove} />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      {feed.nextCursor && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void feed.loadMore()}
            disabled={feed.loadingMore}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--border-strong)] px-5 text-[14px] font-medium text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-60"
          >
            {feed.loadingMore && <Loader2 size={14} className="animate-spin" aria-hidden />} Load more
          </button>
        </div>
      )}
    </div>
  );
}
