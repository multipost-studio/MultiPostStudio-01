import * as React from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { SpotlightCard } from "@/components/spotlight-card";
import { cn } from "@/lib/utils";

export function Hero({
  eyebrow,
  title,
  subtitle,
  primary,
  secondary,
  children,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
  children?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-[var(--border)] bg-[var(--bg-sunken)] px-5 pt-20 pb-16 text-center">
      <div className="mps-aurora" aria-hidden>
        <span />
        <span />
        <span />
      </div>
      <div className="relative z-[2] mx-auto max-w-4xl">
        {eyebrow && (
          <Reveal>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-[14px] font-semibold text-[var(--text-muted)] shadow-sm">
              {eyebrow}
            </span>
          </Reveal>
        )}
        <Reveal delay={0.06} as="div">
          <h1 className="mt-6 text-[2.7rem] font-extrabold leading-[1.05] tracking-[-0.025em] text-[var(--text)] sm:text-[3.4rem] lg:text-[3.9rem]">
            {title}
          </h1>
        </Reveal>
        {subtitle && (
          <Reveal delay={0.12} as="div">
            <p className="mx-auto mt-5 max-w-2xl text-[18px] font-medium leading-relaxed text-[var(--text-muted)] sm:text-[19px]">
              {subtitle}
            </p>
          </Reveal>
        )}
        {(primary || secondary) && (
          <Reveal delay={0.18} as="div">
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {primary && (
                <Button asChild size="lg">
                  <Link href={primary.href}>{primary.label}</Link>
                </Button>
              )}
              {secondary && (
                <Button asChild size="lg" variant="secondary">
                  <Link href={secondary.href}>{secondary.label}</Link>
                </Button>
              )}
            </div>
          </Reveal>
        )}
        {children}
      </div>
    </section>
  );
}

const TONES: Record<string, string> = {
  plain: "bg-[var(--bg)]",
  rose: "bg-[var(--bg-sunken)]",
  blue: "bg-[color-mix(in_srgb,var(--block-blue)_50%,var(--bg))]",
  mint: "bg-[color-mix(in_srgb,var(--block-mint)_50%,var(--bg))]",
};

export function Section({
  title,
  intro,
  children,
  className,
  narrow,
  tone = "plain",
  bleed,
  id,
}: {
  title?: React.ReactNode;
  intro?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  narrow?: boolean;
  tone?: keyof typeof TONES;
  bleed?: boolean;
  id?: string;
}) {
  const inner = (
    <div className={cn("mx-auto px-5 py-16 lg:py-20", narrow ? "max-w-3xl" : "max-w-6xl", className)}>
      {title && (
        <Reveal>
          <h2 className="text-[2rem] font-extrabold tracking-[-0.025em] text-[var(--text)] sm:text-[2.5rem] lg:text-[3rem]">
            {title}
          </h2>
        </Reveal>
      )}
      {intro && (
        <Reveal delay={0.05}>
          <p className="mt-3 max-w-2xl text-[17px] font-medium leading-relaxed text-[var(--text-muted)] lg:text-[18px]">
            {intro}
          </p>
        </Reveal>
      )}
      <div className={cn(title && "mt-10 lg:mt-12")}>{children}</div>
    </div>
  );

  if (bleed) {
    return <section id={id} className={cn("border-b border-[var(--border)]", TONES[tone])}>{inner}</section>;
  }
  return <section id={id}>{inner}</section>;
}

export function FeatureGrid({
  items,
}: {
  items: { icon?: React.ReactNode; title: string; body: string; href?: string }[];
}) {
  const blocks = ["var(--block-violet)", "var(--block-rose)", "var(--block-blue)", "var(--block-amber)", "var(--block-mint)"];
  return (
    <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((f, i) => {
        const inner = (
          <SpotlightCard className="text-left">
            {f.icon && (
              <span
                className="flex h-11 w-11 items-center justify-center rounded-[var(--radius)] text-[var(--primary)] transition-transform duration-200 group-hover:-rotate-6"
                style={{ background: blocks[i % blocks.length] }}
              >
                {f.icon}
              </span>
            )}
            <h3 className="mt-3.5 text-[17px] font-bold text-[var(--text)]">{f.title}</h3>
            <p className="mt-2 text-[15px] font-medium leading-relaxed text-[var(--text-muted)]">{f.body}</p>
            {f.href && (
              <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-bold text-[var(--primary)]">
                Learn more →
              </span>
            )}
          </SpotlightCard>
        );
        return (
          <StaggerItem key={f.title}>
            {f.href ? (
              <Link href={f.href} className="block h-full">
                {inner}
              </Link>
            ) : (
              inner
            )}
          </StaggerItem>
        );
      })}
    </Stagger>
  );
}

export function CTA({
  title = "Ready to find your MultiPost Studio?",
  body = "Free to start. Connect your platforms, import your calendar, and let the AI do the heavy lifting.",
  action = { label: "Get started free", href: "/signup" },
}: {
  title?: React.ReactNode;
  body?: React.ReactNode;
  action?: { label: string; href: string };
}) {
  return (
    <section className="relative overflow-hidden border-t border-[var(--border)] bg-[var(--primary)]">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl"
      />
      <div className="relative mx-auto max-w-3xl px-5 py-24 text-center">
        <Reveal>
          <h2 className="text-[2.1rem] font-extrabold tracking-[-0.025em] text-[var(--primary-text)] sm:text-[2.7rem] lg:text-[3.2rem]">
            {title}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-[16px] font-medium text-[var(--primary-text)]/85">{body}</p>
          <Button
            asChild
            size="lg"
            className="mt-7 bg-[var(--primary-text)] text-[var(--primary)] shadow-[0_14px_34px_-10px_rgba(0,0,0,0.4)] hover:bg-[var(--primary-text)]"
          >
            <Link href={action.href}>{action.label}</Link>
          </Button>
        </Reveal>
      </div>
    </section>
  );
}

export function FAQ({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      {items.map((item) => (
        <Reveal key={item.q}>
          <details className="group mps-block px-5 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between text-[16px] font-bold text-[var(--text)]">
              {item.q}
              <span className="text-[var(--primary)] transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-2 text-[15px] font-medium text-[var(--text-muted)]">{item.a}</p>
          </details>
        </Reveal>
      ))}
    </div>
  );
}

/* ── numbered how-it-works steps ── */
export function StepList({ steps }: { steps: { title: string; body: string }[] }) {
  return (
    <Stagger className="grid gap-5 sm:grid-cols-3">
      {steps.map((s, i) => (
        <StaggerItem key={s.title}>
          <div className="mps-block h-full p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary)] text-[15px] font-extrabold text-[var(--primary-text)]">
              {i + 1}
            </span>
            <h3 className="mt-3 text-[16px] font-bold text-[var(--text)]">{s.title}</h3>
            <p className="mt-1.5 text-[14.5px] font-medium leading-relaxed text-[var(--text-muted)]">{s.body}</p>
          </div>
        </StaggerItem>
      ))}
    </Stagger>
  );
}

/* ── row of headline stats ── */
export function StatStrip({ stats }: { stats: { value: string; label: string }[] }) {
  return (
    <Stagger className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {stats.map((s) => (
        <StaggerItem key={s.label}>
          <div className="mps-block p-5 text-center">
            <p className="text-[1.8rem] font-extrabold text-[var(--primary)]">{s.value}</p>
            <p className="mt-1 text-[12px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{s.label}</p>
          </div>
        </StaggerItem>
      ))}
    </Stagger>
  );
}

/* ── bulleted list with check marks ── */
export function CheckList({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn("space-y-2.5", className)}>
      {items.map((t) => (
        <li key={t} className="flex items-start gap-2.5 text-[15.5px] font-medium leading-relaxed text-[var(--text)]">
          <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
            <Check size={12} strokeWidth={3} />
          </span>
          {t}
        </li>
      ))}
    </ul>
  );
}

/* ── text + visual, alternating ── */
export function SplitFeature({
  eyebrow,
  title,
  body,
  bullets,
  href,
  visual,
  flip,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  body: React.ReactNode;
  bullets?: string[];
  href?: { label: string; url: string };
  visual: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2">
      <Reveal className={flip ? "lg:order-2" : undefined}>
        {eyebrow && (
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">{eyebrow}</p>
        )}
        <h3 className="mt-2 text-[1.6rem] font-bold tracking-[-0.02em] text-[var(--text)] sm:text-[2rem]">{title}</h3>
        <p className="mt-3 max-w-md text-[16px] font-medium leading-relaxed text-[var(--text-muted)]">{body}</p>
        {bullets && <CheckList items={bullets} className="mt-4" />}
        {href && (
          <Link href={href.url} className="mt-5 inline-flex items-center gap-1 text-[14px] font-bold text-[var(--primary)]">
            {href.label} →
          </Link>
        )}
      </Reveal>
      <Reveal delay={0.1} className={flip ? "lg:order-1" : undefined}>
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow)]">
          {visual}
        </div>
      </Reveal>
    </div>
  );
}

export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl space-y-4 text-[16px] font-medium leading-relaxed text-[var(--text-muted)] [&_h2]:mt-8 [&_h2]:text-[20px] [&_h2]:font-bold [&_h2]:text-[var(--text)] [&_h3]:mt-6 [&_h3]:font-bold [&_h3]:text-[var(--text)] [&_a]:font-semibold [&_a]:text-[var(--primary)] [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1">
      {children}
    </div>
  );
}
