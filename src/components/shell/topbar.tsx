"use client";

import Link from "next/link";
import { Search, Plus, PenLine, Lightbulb, Megaphone, Plug } from "lucide-react";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationsMenu } from "./notifications-menu";
import { UserMenu } from "./user-menu";
import { StreakIndicator, type StreakSummary } from "./streak-indicator";
import { FeedbackButton } from "./feedback-button";

import { SidebarTrigger } from "@/components/ui/sidebar";

export function Topbar({
  onMenu,
  onSearch,
  notifications,
  unread,
  streak,
  storageEnabled,
  user,
}: {
  onMenu?: () => void;
  onSearch: () => void;
  notifications: React.ComponentProps<typeof NotificationsMenu>["notifications"];
  unread: number;
  streak: StreakSummary;
  /** Object storage configured — decides whether feedback offers an attachment. */
  storageEnabled: boolean;
  user: { name: string; email: string; image?: string | null; isPlatformAdmin?: boolean };
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 min-w-0 items-center gap-1.5 overflow-x-clip border-b border-[var(--border)] bg-[var(--bg-elevated)]/90 px-2 backdrop-blur sm:gap-2 sm:px-5">
      <SidebarTrigger className="shrink-0" onClick={onMenu} />

      <button
        onClick={onSearch}
        aria-label="Search"
        className="flex h-8 min-w-0 flex-1 basis-0 max-w-xs items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-sunken)] px-2.5 text-[14px] text-[var(--text-subtle)] hover:bg-[var(--surface-hover)]"
      >
        <Search size={14} className="shrink-0" />
        <span className="hidden min-[420px]:block flex-1 truncate text-left">Search…</span>
        <kbd className="hidden shrink-0 rounded border border-[var(--border)] px-1 text-[11px] sm:block">⌘K</kbd>
      </button>

      <div className="min-w-0 flex-1 sm:flex-1" />

      <Dropdown
        align="end"
        label="Create"
        trigger={
          <button className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--primary)] px-2.5 text-[14px] font-semibold text-[var(--primary-text)] shadow-[var(--glow-flame)] transition-all hover:-translate-y-px hover:bg-[var(--primary-hover)] active:translate-y-0">
            <Plus size={15} /> <span className="hidden min-[400px]:inline">Create</span>
          </button>
        }
      >
        <MenuItem asChild>
          <Link href="/composer/new" className="flex items-center gap-2">
            <PenLine size={14} /> New post
          </Link>
        </MenuItem>
        <MenuItem asChild>
          <Link href="/ideas?new=1" className="flex items-center gap-2">
            <Lightbulb size={14} /> New idea
          </Link>
        </MenuItem>
        <MenuItem asChild>
          <Link href="/campaigns?new=1" className="flex items-center gap-2">
            <Megaphone size={14} /> New campaign
          </Link>
        </MenuItem>
        <MenuItem asChild>
          <Link href="/integrations" className="flex items-center gap-2">
            <Plug size={14} /> Connect account
          </Link>
        </MenuItem>
      </Dropdown>

      {/* Theme toggle hides on the narrowest phones (320px header budget);
          mobile users still reach it via the account menu. */}
      <div className="hidden min-[380px]:block shrink-0">
        <ThemeToggle />
      </div>
      {/* Feedback is icon-only below sm but still 40px wide — on a 320px
         phone the header budget only fits the essentials, so it steps aside
         below sm (still one tap away via Settings → Support). */}
      <div className="hidden shrink-0 sm:block">
        <FeedbackButton storageEnabled={storageEnabled} />
      </div>
      <div className="hidden min-[380px]:block shrink-0">
        <StreakIndicator streak={streak} />
      </div>
      <div className="shrink-0">
        <NotificationsMenu notifications={notifications} unread={unread} />
      </div>
      <div className="shrink-0">
        <UserMenu {...user} />
      </div>
    </header>
  );
}
