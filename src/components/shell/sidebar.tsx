"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { ChevronDown, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand";
import { Icon } from "@/components/icon";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { WorkspaceSwitcher } from "./workspace-switcher";
import type { NavGroup } from "@/lib/nav";
import {
  Sidebar as ShadcnSidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarFooter,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

export type Badges = { approvals: number; inbox: number; notifications: number };

export function Sidebar({
  nav,
  badges,
  workspaces,
  activeWorkspaceId,
  orgName,
  canAgency,
  mobileOpen,
  onClose,
}: {
  nav: NavGroup[];
  badges: Badges;
  workspaces: { id: string; name: string; kind: string; clientName: string | null }[];
  activeWorkspaceId: string;
  orgName: string;
  canAgency: boolean;
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  const sidebarCtx = useSidebar();

  const isCollapsedDesktop = sidebarCtx?.state === "collapsed";
  const closeNav = () => {
    onClose?.();
    if (sidebarCtx?.isMobile) {
      sidebarCtx.setOpenMobile(false);
    }
  };

  // Collapsible nav groups (persisted)
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => {
    try {
      const raw = typeof window === "undefined" ? null : window.localStorage.getItem("mps-nav-collapsed");
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set<string>();
    }
  });

  const toggleGroup = (title: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      try {
        window.localStorage.setItem("mps-nav-collapsed", JSON.stringify([...next]));
      } catch {
        /* private mode fallback */
      }
      return next;
    });
  };

  const allHrefs = React.useMemo(() => nav.flatMap((g) => g.items.map((i) => i.href)), [nav]);
  const isActive = (href: string) => {
    if (pathname === href) return true;
    if (href === "/dashboard") return false;
    if (!pathname.startsWith(href + "/")) return false;
    return !allHrefs.some((h) => h.length > href.length && (pathname === h || pathname.startsWith(h + "/")));
  };

  return (
    <ShadcnSidebar collapsible="icon" className="border-r border-[var(--border)] bg-[var(--bg-elevated)]">
      <SidebarHeader className="p-3">
        <div className="flex items-center justify-between px-1 py-1">
          <Link href="/dashboard" aria-label="MultiPost Studio home" className="flex items-center gap-2">
            <Logo size={32} />
          </Link>
          <button
            onClick={closeNav}
            className="rounded-[var(--radius-sm)] p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] lg:hidden"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-1">
          <WorkspaceSwitcher workspaces={workspaces} activeId={activeWorkspaceId} orgName={orgName} />
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2">
        {nav.map((group, gi) => {
          const isGroupCollapsed = !isCollapsedDesktop && !!group.title && collapsed.has(group.title);
          return (
            <SidebarGroup key={gi} className="py-1">
              {group.title ? (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.title!)}
                  aria-expanded={!isGroupCollapsed}
                  className="mb-1 flex w-full items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-left text-[11px] font-bold uppercase tracking-wider text-[var(--text-subtle)] transition-colors hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--ring)] group-data-[collapsible=icon]:hidden"
                >
                  <span className="min-w-0 flex-1 truncate">{group.title}</span>
                  <ChevronDown
                    size={13}
                    aria-hidden
                    className={cn("shrink-0 transition-transform duration-200", isGroupCollapsed && "-rotate-90")}
                  />
                </button>
              ) : null}

              {!isGroupCollapsed && (
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => {
                      const active = isActive(item.href);
                      const badge =
                        item.badgeKey === "approvals"
                          ? badges.approvals
                          : item.badgeKey === "inbox"
                            ? badges.inbox
                            : 0;

                      if (item.locked) {
                        const plan = item.lockedPlan;
                        const href = plan
                          ? `/settings/billing?plan=${plan.key}&feature=${encodeURIComponent(item.label)}`
                          : "/settings/billing";

                        return (
                          <SidebarMenuItem key={item.href}>
                            <SidebarMenuButton
                              asChild
                              tooltip={`${item.label} (${plan?.name ?? "Upgrade"})`}
                              className="text-[var(--text-subtle)] hover:text-[var(--text)]"
                            >
                              <Link href={href} onClick={closeNav}>
                                <Icon name={item.icon} size={16} className="shrink-0 opacity-70" />
                                <span className="min-w-0 flex-1 truncate group-data-[collapsible=icon]:hidden">{item.label}</span>
                                <span className="ml-auto shrink-0 rounded-full bg-[var(--primary-soft)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--primary)] group-data-[collapsible=icon]:hidden">
                                  {plan?.name ?? "Upgrade"}
                                </span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      }

                      return (
                        <SidebarMenuItem key={item.href} className="relative">
                          {active && !reduce && !isCollapsedDesktop && (
                            <motion.span
                              layoutId="nav-active"
                              className="absolute inset-y-0 left-0 w-full rounded-[var(--radius-md)] bg-[var(--primary-soft)] ring-1 ring-inset ring-[var(--primary)]/25"
                              transition={{ type: "spring", stiffness: 380, damping: 32 }}
                            />
                          )}
                          <SidebarMenuButton
                            asChild
                            isActive={active}
                            tooltip={item.label}
                          >
                            <Link
                              href={item.href}
                              onClick={closeNav}
                              aria-current={active ? "page" : undefined}
                              className={cn(
                                "relative flex items-center gap-2.5",
                                active
                                  ? cn("text-[var(--primary)]", reduce && "bg-[var(--primary-soft)]")
                                  : "text-[var(--text-muted)] hover:text-[var(--text)]",
                              )}
                            >
                              <Icon name={item.icon} size={16} className="shrink-0" />
                              <span className="min-w-0 flex-1 truncate group-data-[collapsible=icon]:hidden">{item.label}</span>
                              {badge > 0 && (
                                <SidebarMenuBadge className="group-data-[collapsible=icon]:hidden">
                                  {badge > 99 ? "99+" : badge}
                                </SidebarMenuBadge>
                              )}
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              )}
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="p-3 pb-8">
        <SidebarMenu>
          {canAgency && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/agency")} tooltip="Agency">
                <Link href="/agency" onClick={closeNav}>
                  <Icon name="Building2" size={16} />
                  <span className="group-data-[collapsible=icon]:hidden">Agency</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/settings")} tooltip="Settings">
              <Link href="/settings/profile" onClick={closeNav}>
                <Icon name="Settings" size={16} />
                <span className="group-data-[collapsible=icon]:hidden">Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </ShadcnSidebar>
  );
}
