"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import type { SignalPriority } from "@/lib/admin-signals";

type Badge = { count: number; priority: SignalPriority };
type BadgeState = {
  modules: Record<string, Badge>;
  totalUnread: number;
  topPriority: SignalPriority | null;
};

type NavItem = { label: string; href: string; icon: string };

const POLL_MS = 45_000;

const DOT: Record<SignalPriority, string> = {
  info: "bg-[var(--text-subtle)] text-white",
  warn: "bg-[var(--warning)] text-white",
  critical: "bg-[var(--danger)] text-white",
};

/**
 * The admin chrome — sidebar with per-module badges, header bell, main slot.
 *
 * Badge counts come from the server on first paint and are kept current by a
 * 45s poll of /admin/api/notify-count. When the unread total changes the
 * whole route is refreshed too, so the notification centre and any page that
 * reads the same data stay in sync.
 */
export function AdminShell({
  initial,
  navItems,
  children,
}: {
  initial: BadgeState;
  navItems: NavItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  // No local mirror of the server data: the poll only detects change and asks
  // the server to re-render, so the sidebar, the bell and the notification
  // centre all move together and there is one source of truth.
  const badges = initial;

  React.useEffect(() => {
    let stop = false;
    const seenTotal = initial.totalUnread;
    const seenKey = JSON.stringify(initial.modules);

    async function poll() {
      if (stop || document.hidden) return;
      try {
        const res = await fetch("/admin/api/notify-count", { cache: "no-store" });
        if (!res.ok || stop) return;
        const next: BadgeState = await res.json();
        if (next.totalUnread !== seenTotal || JSON.stringify(next.modules) !== seenKey) {
          router.refresh(); // brings this whole route current
        }
      } catch {
        /* transient — next tick retries */
      }
    }

    const id = setInterval(poll, POLL_MS);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [initial.totalUnread, initial.modules, router]);

  const bellTone =
    badges.topPriority === "critical"
      ? "text-[var(--danger)]"
      : badges.topPriority === "warn"
        ? "text-[var(--warning)]"
        : "text-[var(--text-muted)]";

  return (
    <div className="flex min-h-screen bg-[var(--bg)]">
      <aside className="w-56 shrink-0 border-r border-[var(--border)] bg-[var(--bg-elevated)] p-4">
        <div className="mb-6 flex items-center gap-2">
          <Logo size={24} />
          <span className="rounded bg-[var(--danger-soft)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--danger)]">
            ADMIN
          </span>
        </div>

        <nav className="space-y-0.5">
          {navItems.map((i) => {
            const active = i.href === "/admin" ? pathname === "/admin" : pathname.startsWith(i.href);
            const b = badges.modules[i.label];
            return (
              <Link
                key={i.href}
                href={i.href}
                className={cn(
                  "flex items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-2 text-[14px] font-medium transition-colors",
                  active
                    ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
                )}
              >
                <Icon name={i.icon} size={15} className="shrink-0" />
                <span className="flex-1 truncate">{i.label}</span>
                {b && b.count > 0 && (
                  <span
                    className={cn(
                      "min-w-[18px] rounded-full px-1 text-center text-[11px] font-semibold tabular-nums",
                      DOT[b.priority],
                    )}
                    title={`${b.count} need${b.count === 1 ? "s" : ""} attention`}
                  >
                    {b.count > 99 ? "99+" : b.count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <Link
          href="/dashboard"
          className="mt-6 block rounded-[var(--radius-md)] px-2.5 py-2 text-[14px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
        >
          &larr; Back to app
        </Link>
      </aside>

      <div className="flex-1">
        <header className="flex h-14 items-center justify-between border-b border-[var(--border)] px-6">
          <p className="text-[14px] font-semibold text-[var(--text)]">Platform administration</p>
          <div className="flex items-center gap-1">
            <Link
              href="/admin/notifications"
              className={cn(
                "relative flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] transition-colors hover:bg-[var(--surface-hover)]",
                bellTone,
              )}
              title={
                badges.totalUnread > 0
                  ? `${badges.totalUnread} unread notification${badges.totalUnread === 1 ? "" : "s"}`
                  : "Notifications"
              }
              aria-label="Notifications"
            >
              <Icon name="Bell" size={17} />
              {badges.totalUnread > 0 && (
                <span
                  className={cn(
                    "absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full px-1 text-center text-[10px] font-semibold tabular-nums",
                    DOT[badges.topPriority ?? "info"],
                  )}
                >
                  {badges.totalUnread > 99 ? "99+" : badges.totalUnread}
                </span>
              )}
            </Link>
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto max-w-6xl p-6">{children}</main>
      </div>
    </div>
  );
}
