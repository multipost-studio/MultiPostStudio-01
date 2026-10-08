"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand";
import { Icon } from "@/components/icon";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { SidebarPromos } from "@/components/promo/sidebar-promos";
import type { PromoCardData } from "@/lib/promo-cards";
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
  promoCards,
  variant,
  mobileOpen,
  onClose,
}: {
  nav: NavGroup[];
  badges: Badges;
  workspaces: { id: string; name: string; kind: string; clientName: string | null }[];
  activeWorkspaceId: string;
  orgName: string;
  canAgency: boolean;
  /** Admin-managed promo cards (already filtered for this user). */
  promoCards?: PromoCardData[];
  variant?: "sidebar" | "floating" | "inset";
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

  // Collapsible nav groups (persisted). Start empty so the server render and the first client
  // render agree (reading localStorage here caused a hydration mismatch for anyone with a
  // collapsed group); the saved choice is applied right after mount, without animating.
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set<string>());
  const [restored, setRestored] = React.useState(false);
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem("mps-nav-collapsed");
      if (raw) {
        const saved = JSON.parse(raw) as unknown;
        if (Array.isArray(saved)) setCollapsed(new Set(saved.filter((t): t is string => typeof t === "string")));
      }
    } catch {
      /* private mode or corrupt value: all groups stay open */
    }
    const frame = requestAnimationFrame(() => setRestored(true));
    return () => cancelAnimationFrame(frame);
  }, []);

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
    <ShadcnSidebar collapsible="icon" variant={variant} className="bg-[var(--bg-elevated)]">
      <SidebarHeader className="p-3">
        <div className={cn("flex items-center px-1 py-1", isCollapsedDesktop ? "justify-center" : "justify-between")}>
          <Link href="/dashboard" aria-label="MultiPost Studio home" className="flex shrink-0 items-center gap-2">
            {isCollapsedDesktop ? (
              // The full logo is a wide lock-up; squeezed into the icon rail it distorted. The rail gets the square mark.
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/brand/mark.webp" alt="MultiPost Studio" width={36} height={36} className="h-9 w-9 shrink-0 rounded-[var(--radius-md)] object-contain" />
            ) : (
              <Logo size={46} className="shrink-0" />
            )}
          </Link>
          {/* No close button here on mobile: the drawer (Sheet) already renders its own, and a second one stacked on top of it. */}
        </div>

        <div className="mt-1">
          <WorkspaceSwitcher workspaces={workspaces} activeId={activeWorkspaceId} orgName={orgName} />
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2">
        {nav.map((group, gi) => {
          // A collapsed group that holds the current page stays open, so you always see where you are.
          const holdsActive = group.items.some((i) => isActive(i.href));
          const isGroupCollapsed = !isCollapsedDesktop && !!group.title && collapsed.has(group.title) && !holdsActive;
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

              <AnimatePresence initial={false}>
              {!isGroupCollapsed && (
                <motion.div
                  key="items"
                  initial={reduce ? false : { height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  transition={{ duration: reduce || !restored ? 0.01 : 0.24, ease: EASE }}
                  style={{ overflow: "hidden" }}
                >
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
                </motion.div>
              )}
              </AnimatePresence>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="p-3 pb-8 group-data-[collapsible=icon]:px-2">
        {promoCards && promoCards.length > 0 && <SidebarPromos cards={promoCards} />}
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
    </ShadcnSidebar>
  );
}
