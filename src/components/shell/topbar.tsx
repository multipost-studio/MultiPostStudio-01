"use client";

import Link from "next/link";
import { Menu, Search, Plus, PenLine, Lightbulb, Megaphone, Plug } from "lucide-react";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { ThemeToggle } from "./theme-toggle";
import { NotificationsMenu } from "./notifications-menu";
import { UserMenu } from "./user-menu";

export function Topbar({
  onMenu,
  onSearch,
  notifications,
  unread,
  user,
}: {
  onMenu: () => void;
  onSearch: () => void;
  notifications: React.ComponentProps<typeof NotificationsMenu>["notifications"];
  unread: number;
  user: { name: string; email: string; image?: string | null; isPlatformAdmin?: boolean };
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-elevated)]/90 px-3 backdrop-blur sm:px-5">
      <button onClick={onMenu} className="lg:hidden" aria-label="Open menu">
        <Menu size={20} />
      </button>

      <button
        onClick={onSearch}
        className="flex h-8 flex-1 max-w-xs items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-sunken)] px-2.5 text-[14px] text-[var(--text-subtle)] hover:bg-[var(--surface-hover)]"
      >
        <Search size={14} />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="hidden rounded border border-[var(--border)] px-1 text-[11px] sm:block">⌘K</kbd>
      </button>

      <div className="flex-1" />

      <Dropdown
        align="end"
        trigger={
          <button className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--primary)] px-2.5 text-[14px] font-medium text-white hover:bg-[var(--primary-hover)]">
            <Plus size={15} /> <span className="hidden sm:inline">Create</span>
          </button>
        }
      >
        <MenuItem>
          <Link href="/composer/new" className="flex items-center gap-2">
            <PenLine size={14} /> New post
          </Link>
        </MenuItem>
        <MenuItem>
          <Link href="/ideas?new=1" className="flex items-center gap-2">
            <Lightbulb size={14} /> New idea
          </Link>
        </MenuItem>
        <MenuItem>
          <Link href="/campaigns?new=1" className="flex items-center gap-2">
            <Megaphone size={14} /> New campaign
          </Link>
        </MenuItem>
        <MenuItem>
          <Link href="/integrations" className="flex items-center gap-2">
            <Plug size={14} /> Connect account
          </Link>
        </MenuItem>
      </Dropdown>

      <ThemeToggle />
      <NotificationsMenu notifications={notifications} unread={unread} />
      <UserMenu {...user} />
    </header>
  );
}
