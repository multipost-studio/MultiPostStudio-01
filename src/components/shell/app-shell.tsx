"use client";

import * as React from "react";
import { Sidebar, type Badges } from "./sidebar";
import { Topbar } from "./topbar";
import { CommandPalette } from "./command-palette";
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
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [cmdOpen, setCmdOpen] = React.useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg)]">
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
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onMenu={() => setMobileOpen(true)}
          onSearch={() => setCmdOpen(true)}
          notifications={notifications}
          unread={unread}
          user={user}
        />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
      <TickPoller />
    </div>
  );
}
