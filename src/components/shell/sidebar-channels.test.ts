import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => createElement("a", { href, ...rest }, children),
}));
vi.mock("@/components/ui/sidebar", () => ({ useSidebar: () => ({ state: "expanded", isMobile: false }) }));

import { SidebarChannels, type ChannelAccess } from "./sidebar-channels";

const all: ChannelAccess = { queue: true, inbox: true, analytics: true, connect: true };
const ch = (n: number) => ({ id: `c${n}`, name: `Channel ${n}`, platform: "instagram", avatarUrl: null, scheduled: n % 2 });
const render = (channels: ReturnType<typeof ch>[], access = all) => renderToStaticMarkup(createElement(SidebarChannels, { channels, access }));

describe("SidebarChannels", () => {
  it("lists every connected channel with its scheduled count", () => {
    const html = render([ch(1), ch(2)]);
    expect(html).toContain("Channel 1");
    expect(html).toContain("Channel 2");
    expect(html).toContain('title="1 scheduled"');
    expect(html).not.toContain('title="0 scheduled"');
  });

  it("collapses long lists behind Show more", () => {
    const html = render(Array.from({ length: 11 }, (_, i) => ch(i + 1)));
    expect(html).toContain("Channel 8");
    expect(html).not.toContain("Channel 9");
    expect(html).toContain("Show 3 more");
  });

  it("offers a connect link when there are no channels, only to those allowed", () => {
    expect(render([])).toContain("/integrations");
    expect(render([], { ...all, connect: false })).toBe("");
  });

  it("hides Connect more channels without permission", () => {
    expect(render([ch(1)], { ...all, connect: false })).not.toContain("Connect more channels");
  });
});
