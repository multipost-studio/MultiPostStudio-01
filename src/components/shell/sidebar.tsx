"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand";
import { Icon } from "@/components/icon";
import { WorkspaceSwitcher } from "./workspace-switcher";
import type { NavGroup } from "@/lib/nav";

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
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} aria-hidden />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col border-r border-[var(--border)] bg-[var(--bg-elevated)] transition-transform lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <Link href="/dashboard" aria-label="MultiPost Studio home">
            <Logo size={34} />
          </Link>
          <button onClick={onClose} className="lg:hidden" aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        <div className="px-3 pb-2">
          <WorkspaceSwitcher workspaces={workspaces} activeId={activeWorkspaceId} orgName={orgName} />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2">
          {nav.map((group, gi) => (
            <div key={gi} className="mb-4">
              {group.title && (
                <p className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-[var(--text-subtle)]">
                  {group.title}
                </p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  const badge =
                    item.badgeKey === "approvals"
                      ? badges.approvals
                      : item.badgeKey === "inbox"
                        ? badges.inbox
                        : 0;
                  // A capability this plan doesn't include. Shown rather than
                  // hidden, so the feature is discoverable, and badged with the
                  // plan that unlocks it — a padlock only says "no", the plan
                  // name says what to do about it. The link carries the plan
                  // and the feature so billing can answer the question the
                  // click actually asked.
                  if (item.locked) {
                    const plan = item.lockedPlan;
                    const href = plan
                      ? `/settings/billing?plan=${plan.key}&feature=${encodeURIComponent(item.label)}`
                      : "/settings/billing";
                    return (
                      <li key={item.href}>
                        <Link
                          href={href}
                          onClick={onClose}
                          title={
                            plan
                              ? `${item.label} is included in ${plan.name} — upgrade to use it`
                              : `${item.label} isn't included in your plan`
                          }
                          className="group flex items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-[14px] font-medium text-[var(--text-subtle)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                        >
                          <Icon name={item.icon} size={16} className="shrink-0 opacity-70" />
                          <span className="flex-1 truncate">{item.label}</span>
                          <span className="shrink-0 rounded-full bg-[var(--primary-soft)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--primary)] transition-colors group-hover:bg-[var(--primary)] group-hover:text-white">
                            {plan?.name ?? "Upgrade"}
                          </span>
                        </Link>
                      </li>
                    );
                  }

                  return (
                    <li key={item.href} className="relative">
                      {active && !reduce && (
                        <motion.span
                          layoutId="nav-active"
                          className="absolute inset-0 rounded-[var(--radius-md)] bg-[var(--primary-soft)]"
                          transition={{ type: "spring", stiffness: 380, damping: 32 }}
                        />
                      )}
                      <Link
                        href={item.href}
                        onClick={onClose}
                        className={cn(
                          "group relative flex items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-[14px] font-medium transition-colors",
                          active
                            ? cn("text-[var(--primary)]", reduce && "bg-[var(--primary-soft)]")
                            : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
                        )}
                      >
                        <Icon name={item.icon} size={16} className="shrink-0" />
                        <span className="flex-1 truncate">{item.label}</span>
                        {badge > 0 && (
                          <span className="rounded-full bg-[var(--primary)] px-1.5 text-[11px] font-semibold text-white tabular-nums">
                            {badge > 99 ? "99+" : badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-[var(--border)] p-3">
          {canAgency && (
            <Link
              href="/agency"
              onClick={onClose}
              className={cn(
                "mb-1 flex items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-[14px] font-medium transition-colors",
                isActive("/agency")
                  ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
              )}
            >
              <Icon name="Building2" size={16} /> Agency
            </Link>
          )}
          <Link
            href="/settings/profile"
            onClick={onClose}
            className={cn(
              "flex items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-[14px] font-medium transition-colors",
              isActive("/settings")
                ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
            )}
          >
            <Icon name="Settings" size={16} /> Settings
          </Link>
        </div>
      </aside>
    </>
  );
}
