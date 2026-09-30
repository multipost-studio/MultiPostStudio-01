import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { CHART_COLORS } from "@/components/charts";

export const metadata: Metadata = { title: "Admin · Design system" };

const SEMANTIC_SWATCHES = [
  { name: "primary", var: "--primary" },
  { name: "secondary", var: "--secondary" },
  { name: "accent", var: "--accent" },
  { name: "success", var: "--success" },
  { name: "warning", var: "--warning" },
  { name: "danger", var: "--danger" },
  { name: "info", var: "--info" },
];

const WASH_SWATCHES = [
  { name: "wash-a", var: "--wash-a" },
  { name: "wash-b", var: "--wash-b" },
  { name: "wash-c", var: "--wash-c" },
  { name: "wash-d", var: "--wash-d" },
  { name: "block-rose", var: "--block-rose" },
  { name: "block-blue", var: "--block-blue" },
  { name: "block-mint", var: "--block-mint" },
  { name: "block-amber", var: "--block-amber" },
  { name: "block-violet", var: "--block-violet" },
];

function Swatch({ name, cssVar }: { name: string; cssVar: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="h-16 w-full rounded-[var(--radius-md)] border border-[var(--border)]"
        style={{ background: `var(${cssVar})` }}
      />
      <div className="text-[12px] font-medium text-[var(--text)]">{name}</div>
      <div className="text-[11px] text-[var(--text-subtle)]">{cssVar}</div>
    </div>
  );
}

export default function DesignSystemPage() {
  return (
    <div className="space-y-10 pb-20">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text)]">Design system — Iridescent</h1>
          <p className="mt-1 max-w-prose text-[14px] text-[var(--text-muted)]">
            Living reference for the token foundation. Every swatch/component below reads live CSS
            variables from <code className="text-[13px]">globals.css</code> — nothing here is hardcoded,
            so this page and the rest of the app can never visually drift apart. Toggle theme to review
            both as first-class, not a fallback of the other.
          </p>
        </div>
        <ThemeToggle />
      </div>

      {/* ---------- Color ---------- */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[var(--text)]">Semantic colors</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
          {SEMANTIC_SWATCHES.map((s) => (
            <Swatch key={s.var} name={s.name} cssVar={s.var} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[var(--text)]">Washes &amp; card blocks</h2>
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-5 lg:grid-cols-9">
          {WASH_SWATCHES.map((s) => (
            <Swatch key={s.var} name={s.name} cssVar={s.var} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[var(--text)]">Chart palette</h2>
        <p className="text-[13px] text-[var(--text-subtle)]">
          <code className="text-[12px]">CHART_COLORS</code> in components/charts.tsx — resolves purely
          from tokens, so it inherited the new palette with zero code changes.
        </p>
        <div className="flex flex-wrap gap-4">
          {CHART_COLORS.map((c, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div className="h-12 w-12 rounded-full border border-[var(--border)]" style={{ background: c }} />
              <span className="text-[11px] text-[var(--text-subtle)]">{c.replace("var(", "").replace(")", "")}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Typography ---------- */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[var(--text)]">Typography</h2>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[var(--text-subtle)]">Display + serif accent (font-display / font-serif italic)</div>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-[var(--text)]">
                Solutions built <span className="font-normal italic" style={{ fontFamily: "var(--font-serif)" }}>sur mesure.</span>
              </p>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[var(--text-subtle)]">H1 / H2 / H3 (font-display, already applied site-wide)</div>
              <h1 className="text-[var(--text)]">Heading one</h1>
              <h2 className="text-[var(--text)]">Heading two</h2>
              <h3 className="text-[var(--text)] text-[1.05rem] font-semibold">Heading three</h3>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[var(--text-subtle)]">Body / muted / subtle (font-sans)</div>
              <p className="text-[15px] text-[var(--text)]">Body text at the default 15px product size.</p>
              <p className="text-[14px] text-[var(--text-muted)]">Muted text — secondary descriptions.</p>
              <p className="text-[13px] text-[var(--text-subtle)]">Subtle text — captions, metadata, timestamps.</p>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[var(--text-subtle)]">Eyebrow label</div>
              <span className="text-[12px] font-semibold uppercase tracking-widest text-[var(--text-subtle)]">Services</span>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ---------- Buttons ---------- */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[var(--text)]">Buttons</h2>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="subtle">Subtle</Button>
              <Button variant="danger">Danger</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" size="sm">Small</Button>
              <Button variant="primary" size="md">Medium</Button>
              <Button variant="primary" size="lg">Large</Button>
              <Button variant="primary" className="rounded-full">Pill</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" style={{ background: "var(--gradient-brand)", border: "none" }}>
                Signature gradient CTA
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ---------- Badges ---------- */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[var(--text)]">Badges</h2>
        <Card>
          <CardContent className="flex flex-wrap gap-2 pt-6">
            <Badge tone="neutral">Neutral</Badge>
            <Badge tone="primary">Primary</Badge>
            <Badge tone="accent">Accent</Badge>
            <Badge tone="success">Success</Badge>
            <Badge tone="warning">Warning</Badge>
            <Badge tone="danger">Danger</Badge>
            <Badge tone="info">Info</Badge>
            <Badge tone="primary" dot>With dot</Badge>
          </CardContent>
        </Card>
      </section>

      {/* ---------- Surfaces: solid card vs selective glass ---------- */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[var(--text)]">Surfaces — solid card vs. selective glass</h2>
        <p className="text-[13px] text-[var(--text-subtle)]">
          Glass (<code className="text-[12px]">.mps-glass</code>) is reserved for modals, dropdowns and a
          couple of signature panels — not a default card treatment. Shown here over a blob so the
          translucency is visible; in the app it sits over real page content the same way.
        </p>
        <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] p-8">
          <div className="mps-blob absolute inset-0" aria-hidden />
          <div className="relative grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Solid card</CardTitle>
              </CardHeader>
              <CardContent className="text-[13px] text-[var(--text-muted)]">
                Default surface — opaque, legible, cheap to render. This is what most cards in the app
                should keep using.
              </CardContent>
            </Card>
            <div className="mps-glass rounded-[var(--radius-lg)] p-4">
              <div className="text-[15px] font-semibold text-[var(--text)]">Glass panel</div>
              <div className="mt-1 text-[13px] text-[var(--text-muted)]">
                Selective use only — modals, dropdowns, command palette, the sidebar.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Radius / shadow scale ---------- */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[var(--text)]">Radius &amp; shadow scale</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(["radius-sm", "radius", "radius-lg", "radius-full"] as const).map((r) => (
            <div key={r} className="flex flex-col items-center gap-2">
              <div
                className="h-16 w-full border border-[var(--border-strong)] bg-[var(--surface)]"
                style={{ borderRadius: `var(--${r})` }}
              />
              <span className="text-[12px] text-[var(--text-subtle)]">--{r}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(["shadow-sm", "shadow", "shadow-lg", "shadow-soft"] as const).map((s) => (
            <div key={s} className="flex flex-col items-center gap-2">
              <div
                className="h-16 w-full rounded-[var(--radius-md)] bg-[var(--surface)]"
                style={{ boxShadow: `var(--${s})` }}
              />
              <span className="text-[12px] text-[var(--text-subtle)]">--{s}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
