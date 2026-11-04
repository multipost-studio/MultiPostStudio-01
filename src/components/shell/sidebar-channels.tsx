"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ListOrdered, MessageSquare, BarChart3, Plus } from "lucide-react";
import { PLATFORMS, type PlatformKey } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/misc";
import { PlatformBadge } from "@/components/brand";
import { useSidebar } from "@/components/ui/sidebar";

export type SidebarChannel = {
  id: string;
  name: string;
  platform: string;
  avatarUrl: string | null;
  /** Posts waiting to go out on this channel. */
  scheduled: number;
};

/** A platform that can be connected in one click: its sign-in is configured here and it isn't connected yet. */
export type ConnectablePlatform = { platform: string; label: string; href: string };

/** Which quick actions this person may use; the same permissions the sidebar's own links need. */
export type ChannelAccess = { queue: boolean; inbox: boolean; analytics: boolean; connect: boolean };

const VISIBLE = 8;
const CLOSE_DELAY_MS = 140;
const POPOVER_WIDTH = 232;

/**
 * The workspace's connected channels, in the sidebar. Hovering (or focusing, or tapping) a channel opens its quick actions:
 * see its queue, answer its community, check its insights. In the icon rail only the avatars show. Every figure comes from the
 * database; a workspace with no channels gets a single "Connect a channel" link instead.
 */
export function SidebarChannels({ channels, access, connectable = [], onNavigate }: { channels: SidebarChannel[]; access: ChannelAccess; connectable?: ConnectablePlatform[]; onNavigate?: () => void }) {
  const { state, isMobile } = useSidebar();
  const rail = state === "collapsed" && !isMobile;
  const [showAll, setShowAll] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);

  if (channels.length === 0) {
    if (!access.connect) return null;
    return (
      <div className="px-1 py-1 group-data-[collapsible=icon]:hidden">
        <Link
          href="/integrations"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-1.5 text-[13.5px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          <Plus size={15} aria-hidden="true" /> Connect a channel
        </Link>
      </div>
    );
  }

  const shown = showAll || rail ? channels : channels.slice(0, VISIBLE);
  const hiddenCount = channels.length - shown.length;

  return (
    <section aria-label="Channels" className="py-1 group-data-[collapsible=icon]:mt-1 group-data-[collapsible=icon]:border-t group-data-[collapsible=icon]:border-[var(--sidebar-border)]/60 group-data-[collapsible=icon]:pt-2">
      <h2 className="mb-1 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-[var(--text-subtle)] group-data-[collapsible=icon]:hidden">Channels</h2>
      <ul className="flex flex-col gap-0.5 group-data-[collapsible=icon]:items-center">
        {shown.map((c) => (
          <ChannelRow key={c.id} channel={c} access={access} rail={rail} mobile={isMobile} open={openId === c.id} setOpen={(v) => setOpenId(v ? c.id : (cur) => (cur === c.id ? null : cur))} onNavigate={onNavigate} />
        ))}
      </ul>
      {!rail && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-0.5 flex w-full items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1.5 text-[13px] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          <ChevronDown size={14} aria-hidden="true" /> Show {hiddenCount} more
        </button>
      )}
      {access.connect && (
        <Link
          href="/integrations"
          onClick={onNavigate}
          title="Connect more channels"
          className="mt-0.5 flex items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-1.5 text-[13.5px] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)] group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:w-9 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          <Plus size={16} aria-hidden="true" className="shrink-0" />
          <span className="group-data-[collapsible=icon]:sr-only">Connect more channels</span>
        </Link>
      )}
      {access.connect && connectable.length > 0 && (
        <ul aria-label="Connect a platform" className="mt-1 flex flex-wrap gap-1.5 px-2.5 group-data-[collapsible=icon]:hidden">
          {connectable.map((c) => (
            <li key={c.platform}>
              {/* A plain link, not next/link: it starts a sign-in with the platform, which is a server redirect. */}
              <a href={c.href} title={`Connect ${c.label}`} aria-label={`Connect ${c.label}`} className="inline-flex rounded-[7px] opacity-80 transition hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]">
                <PlatformBadge platform={c.platform} size={22} className="rounded-full" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ChannelRow({
  channel,
  access,
  rail,
  mobile,
  open,
  setOpen,
  onNavigate,
}: {
  channel: SidebarChannel;
  access: ChannelAccess;
  rail: boolean;
  mobile: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
  onNavigate?: () => void;
}) {
  const rowRef = React.useRef<HTMLLIElement>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = React.useState<{ left: number; top: number } | null>(null);
  const panelId = React.useId();

  const cancelClose = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const openNow = React.useCallback(() => {
    cancelClose();
    const el = rowRef.current;
    if (el && !mobile) {
      const r = el.getBoundingClientRect();
      // Keep the panel on screen: it opens beside the row, and slides up when the row is near the bottom.
      const top = Math.max(8, Math.min(r.top - 6, window.innerHeight - 190));
      setPos({ left: r.right, top });
    }
    setOpen(true);
  }, [mobile, setOpen]);
  const closeSoon = () => {
    cancelClose();
    timer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };
  React.useEffect(() => cancelClose, []);

  // Escape and a click elsewhere close it, like any popover.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, setOpen]);

  const label = PLATFORMS[channel.platform as PlatformKey]?.label ?? channel.platform;
  const go = () => {
    setOpen(false);
    onNavigate?.();
  };

  const actions = (
    <ul className="flex flex-col gap-0.5" id={panelId}>
      {access.queue && <Action href={`/queue?channel=${encodeURIComponent(channel.id)}`} icon={<ListOrdered size={15} aria-hidden="true" />} label="Publish" hint={channel.scheduled > 0 ? `${channel.scheduled} scheduled` : "Open its queue"} onClick={go} />}
      {access.inbox && <Action href="/inbox" icon={<MessageSquare size={15} aria-hidden="true" />} label="Community" hint="Messages and comments" onClick={go} />}
      {access.analytics && <Action href="/analytics" icon={<BarChart3 size={15} aria-hidden="true" />} label="Insights" hint="How it's performing" onClick={go} />}
    </ul>
  );
  const hasActions = access.queue || access.inbox || access.analytics;

  return (
    <li ref={rowRef} className="relative group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center" onMouseEnter={mobile ? undefined : openNow} onMouseLeave={mobile ? undefined : closeSoon}>
      <button
        type="button"
        aria-haspopup={hasActions ? "true" : undefined}
        aria-expanded={hasActions ? open : undefined}
        aria-controls={hasActions && open ? panelId : undefined}
        aria-label={rail ? `${channel.name}, ${label}` : undefined}
        title={`${channel.name} · ${label}`}
        onClick={() => (open ? setOpen(false) : openNow())}
        onFocus={mobile ? undefined : openNow}
        onBlur={(e) => {
          // Focus moving to the panel's own links keeps it open; anything else closes it.
          if (!rowRef.current?.contains(e.relatedTarget as Node)) closeSoon();
        }}
        className={cn(
          // --badge-ring is the badge's outline: it matches the row behind it, so the badge never shows a mismatched box on hover.
          "[--badge-ring:var(--bg-elevated)] hover:[--badge-ring:var(--surface-hover)] flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-1.5 text-left transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]",
          open && "bg-[var(--surface-hover)] [--badge-ring:var(--surface-hover)]",
          "group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:w-9 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0",
        )}
      >
        <span className="relative shrink-0">
          <Avatar name={channel.name} src={channel.avatarUrl} size={rail ? 28 : 26} />
          <span className="absolute -bottom-[3px] -right-[3px] grid place-items-center rounded-full ring-[1.5px] ring-[var(--badge-ring)] transition-shadow">
            <PlatformBadge platform={channel.platform} size={14} className="rounded-full" />
          </span>
        </span>
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-[var(--text-muted)] group-data-[collapsible=icon]:hidden">{channel.name}</span>
        {channel.scheduled > 0 && (
          <span className="shrink-0 rounded-full bg-[var(--surface-hover)] px-1.5 text-[11.5px] font-semibold tabular-nums text-[var(--text-muted)] group-data-[collapsible=icon]:hidden" title={`${channel.scheduled} scheduled`}>
            {channel.scheduled > 99 ? "99+" : channel.scheduled}
          </span>
        )}
      </button>

      {open && hasActions && mobile && <div className="ml-3 mt-1 border-l border-[var(--sidebar-border)] pl-2">{actions}</div>}

      {open && hasActions && !mobile && pos && (
        // Fixed so the sidebar's own scroll area never clips it; the left padding is part of the hover area, so the pointer can cross to it.
        <div role="group" aria-label={`${channel.name} quick actions`} className="fixed z-[80] pl-2" style={{ left: pos.left, top: pos.top, width: POPOVER_WIDTH + 8 }} onMouseEnter={cancelClose}>
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg">
            <div className="flex items-center gap-2 px-2 pb-2 pt-1">
              <Avatar name={channel.name} src={channel.avatarUrl} size={28} />
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-[var(--text)]">{channel.name}</p>
                <p className="truncate text-[12px] text-[var(--text-muted)]">{label}</p>
              </div>
            </div>
            {actions}
          </div>
        </div>
      )}
    </li>
  );
}

function Action({ href, icon, label, hint, onClick }: { href: string; icon: React.ReactNode; label: string; hint: string; onClick: () => void }) {
  return (
    <li>
      <Link href={href} onClick={onClick} className="flex items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-1.5 text-[13.5px] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]">
        <span className="text-[var(--text-muted)]">{icon}</span>
        <span className="font-medium text-[var(--text)]">{label}</span>
        <span className="ml-auto truncate text-[12px] text-[var(--text-subtle)]">{hint}</span>
      </Link>
    </li>
  );
}
