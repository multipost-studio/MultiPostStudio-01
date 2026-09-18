"use client";

import * as React from "react";
import { Sidebar, type Badges } from "./sidebar";
import { Topbar } from "./topbar";
import type { StreakSummary } from "./streak-indicator";
import { CommandPalette } from "./command-palette";
import { KeyboardShortcuts } from "./keyboard-shortcuts";
import { TickPoller } from "./tick-poller";
import type { NavGroup } from "@/lib/nav";
import type { NotificationsMenu } from "./notifications-menu";

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
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [cmdOpen, setCmdOpen] = React.useState(false);

  return (
    /* h-dvh (not h-screen): iOS Safari's 100vh includes the area behind the
       URL bar, which pushed the bottom of the shell under the home indicator
       and made short pages look cut off when the bar collapsed. */
    <div className="flex h-screen overflow-hidden bg-[var(--bg)] supports-[height:100dvh]:h-dvh">
      <Sidebar
        nav={nav}
        badges={badges}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        orgName={orgName}
        canAgency={canAgency}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
        <Topbar
          onMenu={() => setMobileOpen(true)}
          onSearch={() => setCmdOpen(true)}
          notifications={notifications}
          unread={unread}
          streak={streak}
          storageEnabled={storageEnabled}
          user={user}
        />
        <main className="flex-1 overflow-y-auto overscroll-contain">
          {banner}
          <div className="mx-auto w-full max-w-[1400px] px-3 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-4 sm:px-6 sm:py-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
      <KeyboardShortcuts onOpenCommand={() => setCmdOpen(true)} />
      <TickPoller />
    </div>
  );
}
