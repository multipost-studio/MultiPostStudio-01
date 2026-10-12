import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Switch } from "./controls";

const html = (props: { checked: boolean; disabled?: boolean }) =>
  renderToStaticMarkup(createElement(Switch, { checked: props.checked, disabled: props.disabled, onCheckedChange: () => undefined, srLabel: "Example" }));

describe("Switch", () => {
  it("is announced as a switch with its state and name", () => {
    expect(html({ checked: true })).toMatch(/role="switch"[^>]*aria-checked="true"|aria-checked="true"[^>]*role="switch"/);
    expect(html({ checked: false })).toContain('aria-checked="false"');
    expect(html({ checked: false })).toContain('aria-label="Example"');
  });

  it("on: the brand colour with a white knob at the right, unchanged", () => {
    const on = html({ checked: true });
    expect(on).toContain("bg-[var(--primary)]");
    expect(on).toContain("translate-x-4");
    expect(on).toContain("bg-white");
  });

  it("off: an outlined track and a muted knob at the left, readable on a dark card (the old grey track almost disappeared)", () => {
    const off = html({ checked: false });
    expect(off).toContain("ring-[var(--text-subtle)]");
    expect(off).toContain("bg-[var(--text-subtle)]");
    expect(off).toContain("translate-x-0");
    expect(off).not.toContain("bg-[var(--border-strong)]");
    expect(off).not.toContain("bg-white");
  });

  it("has an invisible, larger tap area while the visible control stays 36 by 20", () => {
    const m = html({ checked: false });
    expect(m).toContain("h-5 w-9");
    expect(m).toContain("after:-inset-x-1.5");
    expect(m).toContain("after:-inset-y-2.5");
  });

  it("is dimmed and not clickable when disabled", () => {
    const d = html({ checked: true, disabled: true });
    expect(d).toContain("disabled");
    expect(d).toContain("opacity-50");
  });
});
