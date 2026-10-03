"use client";

import Link from "next/link";
import {
  ArrowRight, BadgeCheck, BarChart3, BookOpen, CalendarDays, Clock,
  GraduationCap, LayoutTemplate, Lightbulb, MessagesSquare, PenSquare,
  Send, Sparkles, Users2, Wrench,
} from "lucide-react";
import { Section, CheckList } from "./_components";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { PlatformBadge } from "@/components/brand";
import { PLATFORM_KEYS, PLATFORMS } from "@/lib/constants";
import {
  AiFlowMock, AnalyticsMock, ApprovalsMock, ComposerMock, DemoNote,
  InboxMock, ProductTour, QueueMock,
} from "./_visuals";

/* Shared editorial header: numbered eyebrow + display H2 + lede. */
function ShowcaseHeader({
  index, eyebrow, title, lede, align = "left",
}: {
  index: string; eyebrow: string; title: React.ReactNode; lede: string; align?: "left" | "center";
}) {
  return (
    <Reveal className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--text-subtle)]">
        <span className="mr-2 text-[var(--primary)]">{index}</span> {eyebrow}
      </p>
      <h2 className="mt-3 text-[1.9rem] font-extrabold leading-[1.1] tracking-[-0.025em] text-[var(--text)] sm:text-[2.5rem] lg:text-[2.9rem]">
        {title}
      </h2>
      <p className="mt-4 text-[16px] leading-relaxed text-[var(--text-muted)] sm:text-[17px]">{lede}</p>
    </Reveal>
  );
}

function LearnMore({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-bold text-[var(--primary)] hover:underline"
    >
      {children} <ArrowRight size={15} />
    </Link>
  );
}

/* ── Platform ecosystem bar ─────────────────────────────────── */
export function PlatformBar() {
  return (
    <div className="border-b border-[var(--border)] bg-[var(--bg)]">
      <div className="mx-auto max-w-6xl px-5 py-12 text-center sm:py-14">
        <Reveal>
          <p className="text-[13px] font-bold uppercase tracking-[0.16em] text-[var(--text-subtle)]">
            Connect the platforms you already use
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-7 gap-y-4 sm:gap-x-9">
            {PLATFORM_KEYS.map((p) => (
              <span key={p} className="inline-flex items-center gap-2 text-[14px] font-semibold text-[var(--text-muted)]">
                <PlatformBadge platform={p} size={24} className="rounded-[7px]" />
                {PLATFORMS[p].label}
              </span>
            ))}
          </div>
          <p className="mt-6 text-[13px] font-medium text-[var(--text-subtle)]">
            Direct API publishing · Per-channel queues · Automatic retries
          </p>
        </Reveal>
      </div>
    </div>
  );
}

/* ── Workflow rail: idea → analyze ──────────────────────────── */
const WORKFLOW = [
  { icon: Lightbulb, label: "Idea", body: "Capture every thought on the ideas board." },
  { icon: PenSquare, label: "Create", body: "Draft with AI tuned to your voice." },
  { icon: BadgeCheck, label: "Review", body: "Approvals that freeze on sign-off." },
  { icon: Clock, label: "Schedule", body: "One queue, per-channel timing." },
  { icon: Send, label: "Publish", body: "Auto-publish with retries built in." },
  { icon: BarChart3, label: "Analyze", body: "Insights that say what to do next." },
];

export function WorkflowRail() {
  return (
    <Section bleed tone="plain" id="how-it-works" className="scroll-mt-20">
      <ShowcaseHeader
        align="center"
        index="How it works"
        eyebrow="The whole workflow"
        title={<>From idea to published post, without switching tools</>}
        lede="Six stages, one workspace. Your content moves forward instead of sideways across tabs."
      />
      <Stagger className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 lg:gap-2">
        {WORKFLOW.map((s, i) => (
          <StaggerItem key={s.label} index={i}>
            <div className="relative h-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--primary-soft)] text-[var(--primary)]">
                <s.icon size={17} />
              </span>
              <p className="mt-3 flex items-baseline gap-2 text-[14px] font-bold text-[var(--text)]">
                <span className="text-[11px] font-extrabold text-[var(--text-subtle)]">0{i + 1}</span> {s.label}
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-muted)]">{s.body}</p>
              {i < WORKFLOW.length - 1 && (
                <ArrowRight
                  size={14}
                  aria-hidden
                  className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-[var(--border-strong)] lg:block"
                />
              )}
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </Section>
  );
}

/* ── 01 Plan: content calendar ───────────────────────────────── */
export function PlanShowcase() {
  return (
    <Section bleed tone="rose">
      <div className="grid items-end gap-6 lg:grid-cols-[1.2fr_1fr]">
        <ShowcaseHeader
          index="01"
          eyebrow="Plan"
          title={<>A content calendar the whole team can trust</>}
          lede="Map campaigns and content pillars on one shared calendar. Ideas graduate from the board to scheduled slots — and evergreen recycling keeps the gaps filled automatically."
        />
        <Reveal delay={0.08}>
          <CheckList
            items={[
              "Ideas board with pillar tagging and research stages",
              "Per-channel queue slots set from your engagement data",
              "Evergreen rotation with frequency caps and rest intervals",
            ]}
          />
          <LearnMore href="/features/publishing">Explore publishing</LearnMore>
        </Reveal>
      </div>
      <Reveal delay={0.1} className="mx-auto mt-10 max-w-4xl">
        <ProductTour />
        <DemoNote />
      </Reveal>
    </Section>
  );
}

/* ── 02 Create: composer ─────────────────────────────────────── */
export function CreateShowcase() {
  return (
    <Section bleed tone="plain">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <Reveal>
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--text-subtle)]">
            <span className="mr-2 text-[var(--primary)]">02</span> Create
          </p>
          <h2 className="mt-3 text-[1.9rem] font-extrabold leading-[1.1] tracking-[-0.025em] text-[var(--text)] sm:text-[2.5rem] lg:text-[2.9rem]">
            Write once, perfect for every platform
          </h2>
          <p className="mt-4 max-w-md text-[16px] leading-relaxed text-[var(--text-muted)]">
            The universal composer holds per-channel variants side by side — with live previews,
            character limits and a pre-publish score, so nothing goes out half-baked.
          </p>
          <CheckList
            className="mt-5"
            items={[
              "Per-channel variants with live previews and limits",
              "First comment and UTM links without leaving the editor",
              "Hook strength, CTA and readability scored before scheduling",
            ]}
          />
          <LearnMore href="/features/ai-studio">Explore the AI Studio</LearnMore>
        </Reveal>
        <Reveal delay={0.1}>
          <ComposerMock />
          <DemoNote />
        </Reveal>
      </div>
    </Section>
  );
}

/* ── AI Studio feature band ──────────────────────────────────── */
export function AiSection() {
  return (
    <Section bleed tone="mint">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <Reveal className="lg:order-2">
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--text-subtle)]">
            <span className="mr-2 inline-flex items-center gap-1 text-[var(--primary)]">
              <Sparkles size={12} /> AI Studio
            </span>
          </p>
          <h2 className="mt-3 text-[1.9rem] font-extrabold leading-[1.1] tracking-[-0.025em] text-[var(--text)] sm:text-[2.5rem] lg:text-[2.9rem]">
            On-brand content, on demand
          </h2>
          <p className="mt-4 max-w-md text-[16px] leading-relaxed text-[var(--text-muted)]">
            Describe the campaign. The Brand Brain — trained on your site, docs and best posts —
            drafts hooks, captions and platform variants that sound like you, then slots them
            into the queue.
          </p>
          <CheckList
            className="mt-5"
            items={[
              "Brand Brain calibrated to your actual tone guidelines",
              "Repurpose one idea across formats without copy-paste sameness",
              "Rewrite, shorten or shift tone without losing the point",
            ]}
          />
          <LearnMore href="/features/ai-studio">Explore the AI Studio</LearnMore>
        </Reveal>
        <Reveal delay={0.1} className="lg:order-1">
          <AiFlowMock />
          <DemoNote />
        </Reveal>
      </div>
    </Section>
  );
}

/* ── 03 Publish: queue ───────────────────────────────────────── */
export function PublishShowcase() {
  return (
    <Section bleed tone="plain">
      <ShowcaseHeader
        align="center"
        index="03"
        eyebrow="Publish"
        title={<>One queue for every network</>}
        lede="Fixed weekly slots per channel, automatic retries on failure, and a clear audit of every attempt. When something truly needs a human, you'll know immediately."
      />
      <Reveal delay={0.08} className="mx-auto mt-10 max-w-4xl">
        <QueueMock />
        <DemoNote />
      </Reveal>
      <Reveal className="mt-6 text-center">
        <LearnMore href="/features/recycling">Keep queues full with evergreen recycling</LearnMore>
      </Reveal>
    </Section>
  );
}

/* ── 04 Engage: inbox ────────────────────────────────────────── */
export function EngageShowcase() {
  return (
    <Section bleed tone="rose">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <Reveal className="lg:order-1">
          <InboxMock />
          <DemoNote />
        </Reveal>
        <Reveal delay={0.08} className="lg:order-2">
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--text-subtle)]">
            <span className="mr-2 text-[var(--primary)]">04</span> Engage
          </p>
          <h2 className="mt-3 text-[1.9rem] font-extrabold leading-[1.1] tracking-[-0.025em] text-[var(--text)] sm:text-[2.5rem] lg:text-[2.9rem]">
            Every conversation, one inbox
          </h2>
          <p className="mt-4 max-w-md text-[16px] leading-relaxed text-[var(--text-muted)]">
            Comments, mentions, DMs and reviews land in a single stream with sentiment and
            priority — and one-click AI replies that sound like you, ten times faster.
          </p>
          <CheckList
            className="mt-5"
            items={[
              "Unified queue filtered by platform, status or assignee",
              "Negative conversations rise to the top automatically",
              "Saved replies and internal notes that never send by accident",
            ]}
          />
          <LearnMore href="/features/engagement">Explore engagement</LearnMore>
        </Reveal>
      </div>
    </Section>
  );
}

/* ── 05 Analyze: analytics ───────────────────────────────────── */
export function AnalyticsShowcase() {
  return (
    <Section bleed tone="plain">
      <div className="grid items-end gap-6 lg:grid-cols-[1.2fr_1fr]">
        <ShowcaseHeader
          index="05"
          eyebrow="Analyze"
          title={<>Turn social activity into actionable insights</>}
          lede="Cross-channel rollups, content breakdowns and a 0–100 health score — plus plain-English recommendations for what to do on Monday."
        />
        <Reveal delay={0.08}>
          <CheckList
            items={[
              "Followers, reach and engagement with period-over-period deltas",
              "Which formats and pillars actually move the numbers",
              "White-label reports with scheduled weekly delivery",
            ]}
          />
          <LearnMore href="/features/analytics">Explore analytics</LearnMore>
        </Reveal>
      </div>
      <Reveal delay={0.1} className="mt-10">
        <AnalyticsMock />
        <DemoNote />
      </Reveal>
    </Section>
  );
}

/* ── 06 Collaborate: approvals ───────────────────────────────── */
export function CollabShowcase() {
  return (
    <Section bleed tone="mint">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <Reveal>
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--text-subtle)]">
            <span className="mr-2 text-[var(--primary)]">06</span> Collaborate
          </p>
          <h2 className="mt-3 text-[1.9rem] font-extrabold leading-[1.1] tracking-[-0.025em] text-[var(--text)] sm:text-[2.5rem] lg:text-[2.9rem]">
            Approvals without the bottleneck
          </h2>
          <p className="mt-4 max-w-md text-[16px] leading-relaxed text-[var(--text-muted)]">
            Real review chains — Creator, Editor, Manager, Client — with every action tracked.
            Approved versions freeze, so nobody can silently edit a post after sign-off.
          </p>
          <CheckList
            className="mt-5"
            items={[
              "Multi-stage chains with roles and permissions",
              "Threaded comments and full activity history",
              "Client review portals with read-only access",
            ]}
          />
          <LearnMore href="/solutions/marketing-teams">Explore team workflows</LearnMore>
        </Reveal>
        <Reveal delay={0.1}>
          <ApprovalsMock />
          <DemoNote />
        </Reveal>
      </div>
    </Section>
  );
}

/* ── More capabilities, concise ──────────────────────────────── */
const CAPABILITIES = [
  { icon: CalendarDays, title: "Content calendar", body: "Drag-and-drop planning across every channel.", href: "/features/publishing" },
  { icon: Sparkles, title: "AI Content Studio", body: "Briefings, rewrites and variants in your voice.", href: "/features/ai-studio" },
  { icon: MessagesSquare, title: "Unified inbox", body: "Comments, DMs and reviews in one queue.", href: "/features/engagement" },
  { icon: BarChart3, title: "Analytics & reports", body: "Dashboards, health score and white-label PDFs.", href: "/features/analytics" },
  { icon: Clock, title: "Evergreen recycling", body: "Your best posts keep working on autopilot.", href: "/features/recycling" },
  { icon: Users2, title: "Team workflows", body: "Roles, approvals and client workspaces.", href: "/solutions/marketing-teams" },
];

export function CapabilitiesGrid() {
  return (
    <Section bleed tone="plain">
      <ShowcaseHeader
        align="center"
        index="More"
        eyebrow="Capabilities"
        title={<>Everything else, built in</>}
        lede="No plugin maze. The supporting cast your workflow needs is part of the workspace."
      />
      <Stagger className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CAPABILITIES.map((c, i) => (
          <StaggerItem key={c.title} index={i}>
            <Link
              href={c.href}
              className="group flex h-full items-start gap-3.5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow)]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--bg-sunken)] text-[var(--primary)]">
                <c.icon size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-bold text-[var(--text)]">
                  {c.title} <ArrowRight size={13} className="inline opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                </span>
                <span className="mt-0.5 block text-[13.5px] leading-relaxed text-[var(--text-muted)]">{c.body}</span>
              </span>
            </Link>
          </StaggerItem>
        ))}
      </Stagger>
    </Section>
  );
}

/* ── Trust: verifiable facts only ────────────────────────────── */
const TRUST_FACTS = [
  { value: "10", label: "Supported networks", note: "Every channel in one queue.", href: "/features" },
  { value: "Free", label: "Plan to start", note: "No card. Upgrade when you grow.", href: "/pricing" },
  { value: "Open", label: "Roadmap & changelog", note: "See exactly what's shipping.", href: "/roadmap" },
  { value: "Private", label: "No ad trackers", note: "Your content stays yours.", href: "/security" },
];

export function TrustSection() {
  return (
    <Section bleed tone="rose">
      <ShowcaseHeader
        align="center"
        index="Trust"
        eyebrow="Why teams stay"
        title={<>No hype. Just the facts.</>}
        lede="We'd rather show you the product and the roadmap than quote numbers we can't verify."
      />
      <Stagger className="mx-auto mt-10 grid max-w-4xl grid-cols-2 gap-3 lg:grid-cols-4">
        {TRUST_FACTS.map((t, i) => (
          <StaggerItem key={t.label} index={i}>
            <Link
              href={t.href}
              className="group block h-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 text-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow)]"
            >
              <p className="mps-metric text-[1.7rem] text-[var(--primary)]">{t.value}</p>
              <p className="mt-1 text-[12px] font-bold uppercase tracking-wide text-[var(--text)]">{t.label}</p>
              <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">{t.note}</p>
            </Link>
          </StaggerItem>
        ))}
      </Stagger>
    </Section>
  );
}

/* ── Resources: real links only ──────────────────────────────── */
const RESOURCES = [
  { icon: Wrench, title: "Free marketing tools", body: "Caption generator, hashtag finder, best-time calculator and more.", href: "/tools" },
  { icon: BookOpen, title: "Guides", body: "Practical frameworks for pillars, scheduling and repurposing.", href: "/guides" },
  { icon: LayoutTemplate, title: "Template library", body: "Ready-to-adapt post and campaign templates.", href: "/resources/templates" },
  { icon: GraduationCap, title: "Help center", body: "Answers, how-tos and troubleshooting.", href: "/help" },
];

export function ResourcesSection() {
  return (
    <Section bleed tone="plain">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <ShowcaseHeader
          index="Learn"
          eyebrow="Resources"
          title={<>Fuel your social media success</>}
          lede="Free tools, deep guides and templates — everything around the product, in one place."
        />
        <Reveal delay={0.08}>
          <Link href="/blog" className="inline-flex items-center gap-1.5 text-[14px] font-bold text-[var(--primary)] hover:underline">
            Read the blog <ArrowRight size={15} />
          </Link>
        </Reveal>
      </div>
      <Stagger className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {RESOURCES.map((r, i) => (
          <StaggerItem key={r.title} index={i}>
            <Link
              href={r.href}
              className="group flex h-full flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow)]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[var(--bg-sunken)] text-[var(--primary)]">
                <r.icon size={18} />
              </span>
              <span className="mt-3 block text-[15px] font-bold text-[var(--text)]">{r.title}</span>
              <span className="mt-1 block flex-1 text-[13.5px] leading-relaxed text-[var(--text-muted)]">{r.body}</span>
              <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-bold text-[var(--primary)]">
                Explore <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </StaggerItem>
        ))}
      </Stagger>
    </Section>
  );
}

/* ── Open company ────────────────────────────────────────────── */
export function OpenCompany() {
  return (
    <Section bleed tone="rose">
      <div className="grid items-center gap-8 lg:grid-cols-[1.3fr_1fr]">
        <Reveal>
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--text-subtle)]">About us</p>
          <h2 className="mt-3 max-w-xl text-[1.9rem] font-extrabold leading-[1.1] tracking-[-0.025em] text-[var(--text)] sm:text-[2.5rem] lg:text-[2.9rem]">
            We build in the open
          </h2>
          <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-[var(--text-muted)]">
            Our roadmap, changelog and system status are public. We&apos;d rather be transparent
            and accountable than pretend we have it all figured out.
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Link
              href="/roadmap"
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[var(--primary)] px-5 text-[14px] font-bold text-[var(--primary-text)] transition-transform hover:-translate-y-px"
            >
              See the roadmap <ArrowRight size={15} />
            </Link>
            <Link
              href="/changelog"
              className="inline-flex h-10 items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-5 text-[14px] font-bold text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
            >
              Changelog
            </Link>
            <Link
              href="/status"
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-5 text-[14px] font-bold text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
            >
              <span className="h-2 w-2 rounded-full bg-[var(--success)]" /> Status
            </Link>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--text-subtle)]">Recently shipped</p>
            <ul className="mt-4 space-y-3.5">
              {[
                ["Report builder", "Scheduled delivery with white-label branding"],
                ["Competitor intel", "Benchmark against public accounts"],
                ["Evergreen recycling", "Frequency caps and minimum-gap rules"],
              ].map(([t, b]) => (
                <li key={t} className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)]" />
                  <span>
                    <span className="block text-[14px] font-bold text-[var(--text)]">{t}</span>
                    <span className="block text-[13px] text-[var(--text-muted)]">{b}</span>
                  </span>
                </li>
              ))}
            </ul>
            <Link href="/changelog" className="mt-4 inline-flex items-center gap-1 text-[13px] font-bold text-[var(--primary)] hover:underline">
              Full changelog <ArrowRight size={13} />
            </Link>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

/* ── Final CTA: premium panel, not a flat orange wall ────────── */
export function FinalCta() {
  return (
    <section className="border-b border-[var(--border)] bg-[var(--bg)]">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-5 lg:py-24">
        <Reveal>
          <div className="relative overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-14 text-center shadow-[var(--shadow-lg)] sm:px-12 sm:py-20">
            <div className="mps-blob absolute inset-0 opacity-60" aria-hidden />
            <div className="relative">
              <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--text-subtle)]">
                Get started in minutes
              </p>
              <h2 className="mx-auto mt-3 max-w-2xl text-[2rem] font-extrabold leading-[1.08] tracking-[-0.025em] text-[var(--text)] sm:text-[2.8rem]">
                Grow your social presence with <span className="mps-serif">confidence</span>
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-[var(--text-muted)] sm:text-[17px]">
                Plan, create, publish and analyze your social content from one workspace.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
                <Link
                  href="/signup"
                  className="mps-btn-shine inline-flex h-12 w-full items-center justify-center gap-1.5 rounded-full bg-[var(--primary)] px-8 text-[15px] font-bold text-[var(--primary-text)] transition-transform hover:-translate-y-px sm:w-auto"
                >
                  Get started free <ArrowRight size={16} />
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex h-12 w-full items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-8 text-[15px] font-bold text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)] sm:w-auto"
                >
                  Compare plans
                </Link>
              </div>
              <p className="mt-4 text-[13px] font-medium text-[var(--text-subtle)]">
                Free forever plan · No credit card required
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
