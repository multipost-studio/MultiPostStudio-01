"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Bell, BellOff, CheckCheck, Loader2, RefreshCw, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import type { NotificationDTO, NotificationFilter } from "@/lib/notifications/service";
import { NotificationItem } from "@/components/notifications/notification-item";
import { useNotificationFeed } from "@/components/notifications/use-notification-feed";

const POLL_MS = 60_000;

const TABS: { id: NotificationFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "mentions", label: "Mentions" },
  { id: "publishing", label: "Publishing" },
  { id: "system", label: "System" },
];

const EMPTY: Record<string, { title: string; hint: string }> = {
  all: { title: "You're all caught up", hint: "Publishing results, reminders and team activity will show up here." },
  unread: { title: "Nothing unread", hint: "You've seen everything. New activity appears here first." },
  mentions: { title: "No mentions yet", hint: "When a teammate @mentions you or comments on your post, it lands here." },
  publishing: { title: "No publishing activity", hint: "Results of scheduled and published posts show up here." },
  system: { title: "No system notices", hint: "Product announcements and support replies appear here." },
};

export function NotificationsMenu({
  notifications,
  unread: serverUnread,
  toastEnabled = true,
}: {
  notifications: NotificationDTO[];
  unread: number;
  /** The person's "show a toast for new notifications" setting. */
  toastEnabled?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  // "Open" is tied to the page it was opened on, so following a notification link closes the panel with no effect needed.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt !== null && openAt === pathname;
  const setOpen = useCallback((v: boolean) => setOpenAt(v ? pathname : null), [pathname]);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [ringing, setRinging] = useState(false);
  const [announce, setAnnounce] = useState("");
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const feed = useNotificationFeed({ filter, initial: { items: notifications, nextCursor: null, unread: serverUnread }, initialFilter: "all" });
  const { unread, setUnread, reload } = feed;

  // Refs so the polling closure always sees the current values without re-subscribing.
  const latest = useRef({ unread, open, toastEnabled, reload });
  useEffect(() => {
    latest.current = { unread, open, toastEnabled, reload };
  });
  const seen = useRef(new Set(notifications.map((n) => n.id)));

  // A new arrival: ring the bell, tell screen readers, toast the newest few, refresh the panel if it is open.
  const onCount = useCallback(
    async (count: number) => {
      const before = latest.current.unread;
      setUnread(count);
      if (count <= before) return;
      setRinging(true);
      setTimeout(() => setRinging(false), 800);
      setAnnounce(`${count - before} new notification${count - before === 1 ? "" : "s"}. ${count} unread.`);
      if (latest.current.open) void latest.current.reload();
      try {
        const res = await fetch("/api/notifications?filter=unread&limit=5", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { items: NotificationDTO[] };
        const fresh = data.items.filter((n) => !seen.current.has(n.id));
        data.items.forEach((n) => seen.current.add(n.id));
        if (!latest.current.toastEnabled || latest.current.open) return;
        // At most two toasts, then one summary: a burst must not bury the screen.
        fresh.slice(0, 2).forEach((n) => toast({ title: n.title, description: n.body.slice(0, 120), tone: n.priority === "critical" || n.priority === "high" ? "warning" : "info" }));
        if (fresh.length > 2) toast({ title: `${fresh.length - 2} more notifications`, description: "Open the bell to see them.", tone: "info" });
      } catch {
        /* the badge already updated; the toast is a nicety */
      }
    },
    [setUnread, toast],
  );

  // Server-provided count changed (navigation refreshed the layout).
  useEffect(() => {
    if (serverUnread !== latest.current.unread) void onCount(serverUnread);
  }, [serverUnread, onCount]);

  // Polling: the app has no push channel, so check the count about once a minute while the tab is visible,
  // and straight away when the tab comes back into view.
  useEffect(() => {
    const check = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/notifications?count=1", { cache: "no-store" });
        if (!res.ok) return;
        const { unread: n } = (await res.json()) as { unread: number };
        if (typeof n === "number" && n !== latest.current.unread) void onCount(n);
      } catch {
        /* offline or a blip: try again next time */
      }
    };
    const id = setInterval(check, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [onCount]);

  // Opening the panel refreshes the list. It never marks anything read.
  useEffect(() => {
    if (open) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => panelRef.current?.focus(), 30);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  const openItem = (n: NotificationDTO) => {
    feed.markRead(n);
    setOpen(false);
    if (n.linkUrl && n.linkUrl === pathname) router.refresh();
  };

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
    setFilter(next.id);
    (e.currentTarget.parentElement?.querySelector(`[data-tab="${next.id}"]`) as HTMLElement | null)?.focus();
  };

  const label = `Notifications${unread ? `, ${unread} unread` : ""}`;
  const shown = feed.items;
  const empty = EMPTY[filter] ?? EMPTY.all;
  const loadingFirst = feed.status === "loading" && feed.items.length === 0;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="relative flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
      >
        <Bell size={16} className={ringing ? "mps-bell" : undefined} />
        {unread > 0 && (
          <span
            key={unread}
            aria-hidden
            className="mps-pop absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[11px] font-bold leading-none text-[var(--text-inverted)]"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>

      {open &&
        createPortal(
          <>
            <div aria-hidden className="fixed inset-0 z-[69] bg-[var(--overlay)]/40 sm:hidden" onClick={() => setOpen(false)} />
            <div
              ref={panelRef}
              id={panelId}
              role="dialog"
              aria-label={label}
              tabIndex={-1}
              className="mps-scale-in fixed inset-x-2 top-[calc(4.25rem+env(safe-area-inset-top,0px))] z-[70] flex max-h-[min(78dvh,640px)] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-xl outline-none sm:inset-x-auto sm:right-6 sm:w-[420px] lg:right-8"
            >
              <div className="flex items-center gap-2 px-4 pb-2 pt-3.5">
                <h2 className="text-[15px] font-semibold text-[var(--text)]">Notifications</h2>
                {unread > 0 && (
                  <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[12px] font-semibold text-[var(--primary)]">{unread} unread</span>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={feed.markAll}
                    disabled={unread === 0}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium text-[var(--primary)] hover:bg-[var(--primary-soft)] focus-visible:outline-2 focus-visible:outline-[var(--ring)] disabled:pointer-events-none disabled:opacity-40"
                  >
                    <CheckCheck size={14} aria-hidden /> Mark all read
                  </button>
                  <Link
                    href="/settings/notifications"
                    aria-label="Notification settings"
                    title="Notification settings"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
                  >
                    <Settings size={15} />
                  </Link>
                </div>
              </div>

              <div role="tablist" aria-label="Filter notifications" className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                      "h-8 shrink-0 rounded-full px-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[var(--ring)]",
                      filter === t.id ? "bg-[var(--text)] text-[var(--bg-elevated)]" : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div role="tabpanel" aria-label={TABS.find((t) => t.id === filter)?.label} className="min-h-[120px] flex-1 overflow-y-auto overscroll-contain border-t border-[var(--border)]">
                {loadingFirst ? (
                  <ul className="divide-y divide-[var(--border)]" aria-busy="true" aria-label="Loading notifications">
                    {[0, 1, 2].map((i) => (
                      <li key={i} className="flex gap-3 px-4 py-3.5">
                        <span className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-[var(--surface-hover)]" />
                        <span className="flex-1 space-y-2 pt-1">
                          <span className="block h-3 w-2/3 animate-pulse rounded bg-[var(--surface-hover)]" />
                          <span className="block h-3 w-full animate-pulse rounded bg-[var(--surface-hover)]" />
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : feed.status === "error" && feed.items.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                    <p className="text-[14px] font-medium text-[var(--text)]">Couldn&apos;t load notifications</p>
                    <p className="text-[13px] text-[var(--text-muted)]">Check your connection and try again.</p>
                    <button
                      type="button"
                      onClick={() => void reload()}
                      className="mt-1 inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--border-strong)] px-3 text-[13px] font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
                    >
                      <RefreshCw size={13} aria-hidden /> Try again
                    </button>
                  </div>
                ) : shown.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-hover)] text-[var(--text-subtle)]">
                      <BellOff size={20} aria-hidden />
                    </span>
                    <p className="text-[14px] font-medium text-[var(--text)]">{empty.title}</p>
                    <p className="max-w-[28ch] text-[13px] text-[var(--text-muted)]">{empty.hint}</p>
                  </div>
                ) : (
                  <>
                    <ul>
                      {shown.map((n) => (
                        <NotificationItem key={n.id} n={n} onOpen={openItem} onToggleRead={feed.toggleRead} />
                      ))}
                    </ul>
                    {feed.nextCursor && (
                      <button
                        type="button"
                        onClick={() => void feed.loadMore()}
                        disabled={feed.loadingMore}
                        className="flex w-full items-center justify-center gap-2 border-t border-[var(--border)] py-3 text-[13px] font-medium text-[var(--primary)] hover:bg-[var(--surface-hover)] disabled:opacity-60"
                      >
                        {feed.loadingMore && <Loader2 size={14} className="animate-spin" aria-hidden />} Load more
                      </button>
                    )}
                  </>
                )}
              </div>

              <div className="border-t border-[var(--border)] px-4 py-2.5 text-center">
                <Link
                  href={filter === "all" || filter === "unread" ? "/notifications" : `/notifications?filter=${filter}`}
                  className="text-[13px] font-medium text-[var(--primary)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
                >
                  View all notifications
                </Link>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
