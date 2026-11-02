import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./workspace-switcher", () => ({ WorkspaceSwitcher: () => null }));
vi.mock("@/components/promo/sidebar-promos", () => ({ SidebarPromos: () => null }));
vi.mock("./notifications-menu", () => ({ NotificationsMenu: () => null }));
vi.mock("./user-menu", () => ({ UserMenu: () => null }));
vi.mock("./streak-indicator", () => ({ StreakIndicator: () => null }));
vi.mock("./feedback-button", () => ({ FeedbackButton: () => null }));
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }));

import { Sidebar } from "./sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Topbar } from "./topbar";

const nav = [{ title: "", items: [{ label: "Dashboard", href: "/dashboard", icon: "layout-dashboard" }] }];
const sidebar = (defaultOpen: boolean) =>
  renderToStaticMarkup(
    createElement(
      SidebarProvider,
      { defaultOpen },
      createElement(Sidebar, {
        nav: nav as never,
        badges: { approvals: 0, inbox: 0, notifications: 0 },
        workspaces: [],
        activeWorkspaceId: "w",
        orgName: "Org",
        canAgency: false,
      }),
    ),
  );

describe("sidebar open and close button", () => {
  it("open sidebar: a close button sits next to the logo, and the logo is still a link home", () => {
    const h = sidebar(true);
    expect(h).toContain('aria-label="Close sidebar"');
    expect(h).toContain('aria-label="MultiPost Studio home"');
    expect(h).not.toContain('aria-label="Open sidebar"');
  });
});

describe("collapsed sidebar", () => {
  it("the logo becomes the button that opens the sidebar, and there is no separate link or close button", () => {
    const h = sidebar(false);
    expect(h).toContain('aria-label="Open sidebar"');
    expect(h).toContain("/brand/mark.webp");
    // the logo turns into the sidebar icon on hover or keyboard focus
    expect(h).toContain("group-hover/logo:opacity-0");
    expect(h).toContain("group-hover/logo:opacity-100");
    expect(h).not.toContain('aria-label="Close sidebar"');
    expect(h).not.toContain('aria-label="MultiPost Studio home"');
  });
});

describe("top bar menu button", () => {
  it("is only for phones and tablets: a desktop uses the sidebar's own button", () => {
    const h = renderToStaticMarkup(
      createElement(
        SidebarProvider,
        {},
        createElement(Topbar, {
          onSearch: () => {},
          notifications: [],
          unread: 0,
          toastEnabled: false,
          streak: { current: 0, longest: 0, activeToday: false } as never,
          storageEnabled: false,
          user: { name: "A", email: "a@x.com" },
        } as never),
      ),
    );
    expect(h).toMatch(/data-sidebar="trigger"[^>]*class="[^"]*lg:hidden/);
  });
});
