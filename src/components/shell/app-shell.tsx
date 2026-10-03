"use client";

import * as React from "react";
import { Sidebar, type Badges } from "./sidebar";
import { Topbar } from "./topbar";
import type { StreakSummary } from "./streak-indicator";
import { CommandPalette } from "./command-palette";
import { KeyboardShortcuts } from "./keyboard-shortcuts";
import { TickPoller } from "./tick-poller";
import { MascotHost } from "@/components/mascot";
import type { NavGroup } from "@/lib/nav";
import type { NotificationsMenu } from "./notifications-menu";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";

export function AppShell({
  nav,
  badges,
  workspaces,
  activeWorkspaceId,
  orgName,
  canAgency,
  user,
  notifications,
  unread,
  streak,
  storageEnabled,
  banner,
  firstRun,
  progress,
  children,
}: {
  nav: NavGroup[];
  badges: Badges;
  workspaces: { id: string; name: string; kind: string; clientName: string | null }[];
  activeWorkspaceId: string;
  orgName: string;
  canAgency: boolean;
  user: { name: string; email: string; image?: string | null; isPlatformAdmin?: boolean };
  notifications: React.ComponentProps<typeof NotificationsMenu>["notifications"];
  unread: number;
  streak: StreakSummary;
  storageEnabled: boolean;
  banner?: React.ReactNode;
  /** True when the account is brand-new — the companion greets once. */
  firstRun?: boolean;
  /** Getting-started progress for the companion checklist. Null hides it. */
  progress?: { connected: boolean; created: boolean; scheduled: boolean } | null;
  children: React.ReactNode;
}) {
  const [cmdOpen, setCmdOpen] = React.useState(false);

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="relative flex h-screen w-full overflow-hidden bg-[var(--bg)] supports-[height:100dvh]:h-dvh">
        {/* Ambient app-wide gradient atmosphere */}
        <div aria-hidden className="mps-shell-glow pointer-events-none absolute inset-0 z-0" />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[200] focus:rounded-[var(--radius-md)] focus:bg-[var(--primary)] focus:px-3 focus:py-2 focus:text-[14px] focus:font-medium focus:text-[var(--primary-text)]"
        >
          Skip to content
        </a>

        {/* Official shadcn Sidebar */}
        <Sidebar
          nav={nav}
          badges={badges}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          orgName={orgName}
          canAgency={canAgency}
        />

        {/* Main layout inset */}
        <SidebarInset className="relative z-10 flex min-w-0 flex-1 flex-col overflow-x-clip bg-[var(--bg)]">
          <Topbar
            onSearch={() => setCmdOpen(true)}
            notifications={notifications}
            unread={unread}
            streak={streak}
            storageEnabled={storageEnabled}
            user={user}
          />
          <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto overscroll-contain">
            {banner}
            <div className="mx-auto w-full max-w-[1400px] px-3 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-4 sm:px-6 sm:py-6 lg:px-8">
              {children}
            </div>
          </main>
        </SidebarInset>

        <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
        <KeyboardShortcuts onOpenCommand={() => setCmdOpen(true)} />
        <TickPoller />
        {/* MultiPost companion */}
        <MascotHost
          firstRun={firstRun}
          userName={user.name}
          progress={progress}
          streakSaverDays={streak.status === "at_risk" && !streak.todayScheduled ? streak.current : null}
          workNudges={{
            approvals: badges.approvals,
            inbox: badges.inbox,
            milestone:
              streak.nextMilestone !== null &&
              streak.daysToNextMilestone !== null &&
              streak.daysToNextMilestone <= 2 &&
              streak.daysToNextMilestone > 0
                ? { next: streak.nextMilestone, inDays: streak.daysToNextMilestone }
                : null,
          }}
        />
      </div>
    </SidebarProvider>
  );
}
