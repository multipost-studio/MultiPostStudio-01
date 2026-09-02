"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Bell } from "lucide-react";
import { Dropdown } from "@/components/ui/dropdown";
import { relativeTime, cn } from "@/lib/utils";
import { markNotificationReadAction, markAllNotificationsReadAction } from "@/app/actions/notifications";

type N = {
  id: string;
  type: string;
  title: string;
  body: string;
  linkUrl: string | null;
  readAt: Date | string | null;
  createdAt: Date | string;
};

export function NotificationsMenu({ notifications, unread }: { notifications: N[]; unread: number }) {
  const [, start] = useTransition();

  return (
    <Dropdown
      align="end"
      className="w-[360px] p-0"
      trigger={
        <button
          className="relative flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        >
          <Bell size={16} />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[9px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      }
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2.5">
        <p className="text-[14px] font-semibold text-[var(--text)]">Notifications</p>
        {unread > 0 && (
          <button
            onClick={() => start(() => markAllNotificationsReadAction())}
            className="text-[13px] text-[var(--primary)] hover:underline"
          >
            Mark all read
          </button>
        )}
      </div>
      <div className="max-h-[380px] overflow-y-auto">
        {notifications.length === 0 ? (
          <p className="px-3 py-8 text-center text-[14px] text-[var(--text-muted)]">You&apos;re all caught up.</p>
        ) : (
          notifications.map((n) => {
            const inner = (
              <div
                className={cn(
                  "flex gap-2.5 px-3 py-2.5 transition-colors hover:bg-[var(--surface-hover)]",
                  !n.readAt && "bg-[var(--primary-soft)]/40",
                )}
              >
                <span
                  className={cn(
                    "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                    n.readAt ? "bg-transparent" : "bg-[var(--primary)]",
                  )}
                />
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-[var(--text)]">{n.title}</p>
                  <p className="text-[13px] text-[var(--text-muted)] line-clamp-2">{n.body}</p>
                  <p className="mt-0.5 text-[12px] text-[var(--text-subtle)]">{relativeTime(n.createdAt)}</p>
                </div>
              </div>
            );
            return n.linkUrl ? (
              <Link
                key={n.id}
                href={n.linkUrl}
                onClick={() => start(() => markNotificationReadAction(n.id))}
                className="block"
              >
                {inner}
              </Link>
            ) : (
              <button
                key={n.id}
                onClick={() => start(() => markNotificationReadAction(n.id))}
                className="block w-full text-left"
              >
                {inner}
              </button>
            );
          })
        )}
      </div>
    </Dropdown>
  );
}
