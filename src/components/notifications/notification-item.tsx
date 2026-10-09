"use client";

import Link from "next/link";
import { isExternalUrl } from "@/lib/notifications/links";
import { Check, Circle, Trash2 } from "lucide-react";
import { cn, relativeTime } from "@/lib/utils";
import { platformName } from "@/lib/notifications/types";
import type { NotificationDTO } from "@/lib/notifications/service";
import { iconFor, TONE_CLASS } from "./notification-meta";

/** An internal path uses the router; an announcement's https link opens in a new tab, safely. */
function ActionLink({ href, onClick, className, children }: { href: string; onClick: () => void; className: string; children: React.ReactNode }) {
  return isExternalUrl(href) ? (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={className}>
      {children}
    </a>
  ) : (
    <Link href={href} onClick={onClick} className={className}>
      {children}
    </Link>
  );
}

/**
 * One notification row, shared by the bell panel and the /notifications page.
 *
 * The main area is a single link (or button when there is nowhere to go). Secondary actions and the
 * read/delete controls are siblings of it, never nested inside, so there is no button-in-link markup and
 * every control is its own tab stop with its own accessible name.
 */
export function NotificationItem({
  n,
  onOpen,
  onToggleRead,
  onDelete,
  onAction,
  roomy = false,
}: {
  n: NotificationDTO;
  /** Primary click: mark read, then navigate. The caller decides how. */
  onOpen: (n: NotificationDTO) => void;
  onToggleRead?: (n: NotificationDTO) => void;
  onDelete?: (n: NotificationDTO) => void;
  /** A secondary action (e.g. "View post"). */
  onAction?: (n: NotificationDTO, url: string) => void;
  roomy?: boolean;
}) {
  const { Icon, tone } = iconFor(n);
  const unread = !n.readAt;
  const critical = n.priority === "critical";
  const body = (
    <>
      <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full", TONE_CLASS[tone])} aria-hidden>
        <Icon size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <span className={cn("min-w-0 flex-1 text-[14px] leading-snug text-[var(--text)]", unread ? "font-semibold" : "font-medium")}>
            {n.title}
          </span>
          {unread && <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--primary)]" />}
        </span>
        <span className={cn("mt-0.5 block text-[13px] leading-snug text-[var(--text-muted)]", roomy ? "line-clamp-3" : "line-clamp-2")}>{n.body}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-[var(--text-subtle)]">
          <time dateTime={n.createdAt} suppressHydrationWarning>
            {relativeTime(n.createdAt)}
          </time>
          {n.platform && <span>· {platformName(n.platform)}</span>}
          {critical && <span className="font-medium text-[var(--danger)]">· Needs attention</span>}
          {unread && <span className="sr-only">Unread</span>}
        </span>
      </span>
    </>
  );

  const rowClass = cn(
    "flex w-full items-start gap-3 px-3.5 text-left outline-none transition-colors hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]",
    roomy ? "py-3.5 pr-20" : "py-3 pr-12",
  );

  const showActions = n.actionLabel || n.actions.length > 0;

  return (
    <li
      className={cn(
        "group/n relative border-b border-[var(--border)] last:border-b-0",
        unread && "bg-[var(--primary-soft)]/35",
        critical && unread && "shadow-[inset_3px_0_0_var(--danger)]",
      )}
    >
      {n.linkUrl ? (
        <ActionLink href={n.linkUrl} onClick={() => onOpen(n)} className={rowClass}>
          {body}
        </ActionLink>
      ) : (
        <button type="button" onClick={() => onOpen(n)} className={rowClass}>
          {body}
        </button>
      )}

      {showActions && (
        <div className={cn("flex flex-wrap gap-2 pb-3 pl-[3.75rem] pr-3", roomy ? "-mt-1" : "-mt-1.5")}>
          {n.actionLabel && n.linkUrl && (
            <ActionLink
              href={n.linkUrl}
              onClick={() => onOpen(n)}
              className="inline-flex h-7 items-center rounded-full bg-[var(--primary)] px-3 text-[12px] font-semibold text-[var(--primary-text)] hover:bg-[var(--primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
            >
              {n.actionLabel}
            </ActionLink>
          )}
          {n.actions.map((a) => (
            <Link
              key={`${a.label}:${a.url}`}
              href={a.url}
              onClick={() => (onAction ? onAction(n, a.url) : onOpen(n))}
              className="inline-flex h-7 items-center rounded-full border border-[var(--border-strong)] px-3 text-[12px] font-medium text-[var(--text)] hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
            >
              {a.label}
            </Link>
          ))}
        </div>
      )}

      {(onToggleRead || onDelete) && (
        <div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within/n:opacity-100 sm:group-hover/n:opacity-100">
          {onToggleRead && (
            <button
              type="button"
              onClick={() => onToggleRead(n)}
              aria-label={unread ? `Mark as read: ${n.title}` : `Mark as unread: ${n.title}`}
              title={unread ? "Mark as read" : "Mark as unread"}
              className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-subtle)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
            >
              {unread ? <Check size={14} /> : <Circle size={12} />}
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(n)}
              aria-label={`Dismiss: ${n.title}`}
              title="Dismiss"
              className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-subtle)] hover:bg-[var(--surface-hover)] hover:text-[var(--danger)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      )}
    </li>
  );
}
