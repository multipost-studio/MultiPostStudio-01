import Link from "next/link";
import {
  Users2, Smartphone, LinkIcon, Bot,
  Wrench, BookOpen, LayoutTemplate, GraduationCap, Clock, ArrowRight, LifeBuoy,
} from "lucide-react";
import { Section, CTA } from "./_components";
import { Reveal, Stagger, StaggerItem, CountUp } from "@/components/motion";
import { PlatformBadge } from "@/components/brand";
import { MarketingHero } from "./_hero";
import { Identicon, MiniArea, MiniBars, MiniDonut, MiniHeatmap } from "./_visuals";
import { PLATFORM_KEYS } from "@/lib/constants";

const LOGOS = ["Northwind", "Alpine", "Fitwave", "Loopcraft", "Brightwave", "Emberline", "Studio Nova", "Benchmark"];

/* ── section 3: feature bento (2×2) ── */
const BENTO = [
  {
    tone: "var(--block-rose)",
    kicker: "Publish",
    title: "The most complete publishing engine",
    body: "Schedule to Instagram, Facebook, LinkedIn, X, TikTok, YouTube, Pinterest, Threads, Bluesky and Google Business — with per-channel queues, live previews and automatic retries.",
    href: "/features/publishing",
    viz: <MiniHeatmap />,
  },
  {
    tone: "var(--block-mint)",
    kicker: "Create",
    title: "Turn any idea into the perfect post",
    body: "The AI Content Studio drafts hooks, captions, hashtags and platform variants tuned to your Brand Brain — then scores each post before it goes live.",
    href: "/features/ai-studio",
    viz: <MiniBars />,
  },
  {
    tone: "var(--block-amber)",
    kicker: "Community",
    title: "Reply to comments in a flash",
    body: "Comments, mentions, DMs and reviews land in one inbox with sentiment and priority. One-click AI replies that sound like you, ten times faster.",
    href: "/features/engagement",
    viz: <MiniDonut />,
  },
  {
    tone: "var(--block-blue)",
    kicker: "Insights",
    title: "Answers, not just analytics",
    body: "Not just charts — what happened, why it happened, and what to do next. Cross-channel reporting, competitor intel and a 0–100 health score.",
    href: "/features/analytics",
    viz: <MiniArea />,
  },
];

/* ── section 4: and so much more ── */
const MORE = [
  { icon: Users2, tone: "var(--block-violet)", title: "Collaboration", body: "Manage, edit and approve social media posts from your team.", href: "/solutions/marketing-teams" },
  { icon: Smartphone, tone: "var(--block-rose)", title: "Mobile app", body: "Manage your accounts and queue from anywhere.", href: "/features/publishing" },
  { icon: LinkIcon, tone: "var(--block-amber)", title: "Link hub", body: "Turn your bio link into a powerful, personalised page.", href: "/features/link-hub" },
  { icon: Bot, tone: "var(--block-mint)", title: "AI agent", body: "Briefings, rewrites, ideas and daily what-to-post picks.", href: "/features/ai-studio" },
];

/* ── section 8: resources ── */
const RESOURCES = [
  { icon: Wrench, tone: "var(--block-rose)", title: "Free marketing tools", body: "Caption generator, hashtag finder, best-time calculator and more.", href: "/tools" },
  { icon: BookOpen, tone: "var(--block-blue)", title: "Social media glossary", body: "Every term worth knowing, explained plainly.", href: "/guides" },
  { icon: LayoutTemplate, tone: "var(--block-mint)", title: "Template library", body: "Ready-to-adapt post and campaign templates.", href: "/resources/templates" },
  { icon: GraduationCap, tone: "var(--block-amber)", title: "Social media 101", body: "Your go-to guide for the fundamentals and beyond.", href: "/guides" },
  { icon: Clock, tone: "var(--primary-soft)", title: "Best time to post", body: "Discover the best times to post on social, from your own data.", href: "/tools/best-time" },
];

const COMMUNITY = [
  { name: "Mara Lee", note: "12.4K followers on Instagram" },
  { name: "Ivo Ruiz", note: "3.1K followers on LinkedIn" },
  { name: "Tess Ng", note: "48K followers on TikTok" },
];

export default function LandingPage() {
  return (
    <main>
      <MarketingHero />

      {/* 2 · logo strip */}
      <div className="border-b border-[var(--border)] bg-[var(--bg)] py-9">
        <div className="mx-auto max-w-6xl px-5 text-center">
          <p className="text-[14px] font-medium text-[var(--text-subtle)]">
            100,000+ creators, brands and agencies use MultiPost Studio
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-9 gap-y-3 opacity-70">
            {LOGOS.map((l) => (
              <span key={l} className="text-[16px] font-extrabold tracking-tight text-[var(--text-subtle)]">
                {l}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 3 · feature bento */}
      <Section bleed tone="plain">
        <Stagger className="grid gap-5 md:grid-cols-2">
          {BENTO.map((b) => (
            <StaggerItem key={b.kicker}>
              <Link href={b.href} className="group block h-full">
                <div
                  className="flex h-full flex-col overflow-hidden rounded-[var(--radius-lg)] p-6 transition-transform duration-200 group-hover:-translate-y-1 sm:p-7"
                  style={{ background: b.tone }}
                >
                  <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">{b.kicker}</p>
                  <h3 className="mt-2 text-[20px] font-bold leading-snug text-[var(--text)] sm:text-[22px]">{b.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-[var(--text-muted)]">{b.body}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-[14px] font-bold text-[var(--primary)]">
                    Learn more <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                  <div className="mt-5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3">
                    {b.viz}
                  </div>
                </div>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      {/* 4 · and so much more */}
      <Section bleed tone="rose" title="…and so much more" narrow>
        <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MORE.map((m) => (
            <StaggerItem key={m.title}>
              <Link href={m.href} className="group block h-full">
                <div className="flex h-full flex-col rounded-[var(--radius-lg)] p-5 transition-transform duration-200 group-hover:-translate-y-1" style={{ background: m.tone }}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius)] bg-[var(--surface)] text-[var(--primary)]">
                    <m.icon size={18} />
                  </span>
                  <p className="mt-3 text-[16px] font-bold text-[var(--text)]">{m.title}</p>
                  <p className="mt-1 flex-1 text-[14px] leading-relaxed text-[var(--text-muted)]">{m.body}</p>
                  <span className="mt-3 text-[13px] font-bold text-[var(--primary)]">Learn more →</span>
                </div>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      {/* 5 · connect your accounts */}
      <div className="border-y border-[var(--border)] bg-[var(--bg-sunken)] py-12">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <p className="text-[14px] font-bold uppercase tracking-[0.12em] text-[var(--text-subtle)]">
            Connect your favorite accounts
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {PLATFORM_KEYS.map((p) => (
              <PlatformBadge key={p} platform={p} size={40} className="rounded-[12px] shadow-[var(--shadow)]" />
            ))}
          </div>
        </div>
      </div>

      {/* 6 · grow from zero → one → one million */}
      <Section bleed tone="plain">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <Reveal>
            <h2 className="text-[1.9rem] font-bold tracking-[-0.02em] text-[var(--text)] sm:text-[2.4rem]">
              Grow from zero → one → <span className="mps-serif">one million</span>
            </h2>
            <p className="mt-4 max-w-md text-[16px] leading-relaxed text-[var(--text-muted)]">
              Whether you&apos;re just getting started on your creator journey or scaling your
              audience — MultiPost Studio has the tools to get you there.
            </p>
            <ul className="mt-5 space-y-2 text-[15px] font-medium text-[var(--text)]">
              {["Save all your ideas as reusable drafts", "Learn exactly what content works and why", "Create once, repurpose everywhere"].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)]" />
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]">
              <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--text-subtle)]">
                The MultiPost Studio creator community
              </p>
              <div className="mt-4 space-y-3">
                {COMMUNITY.map((c) => (
                  <div key={c.name} className="flex items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] p-3">
                    <Identicon name={c.name} className="h-10 w-10 shrink-0 rounded-full" />
                    <div>
                      <p className="text-[14px] font-bold text-[var(--text)]">{c.name}</p>
                      <p className="text-[12px] text-[var(--text-subtle)]">{c.note}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* 7 · human support */}
      <Section bleed tone="mint">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <Reveal>
            <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Customer support</p>
            <h2 className="mt-2 text-[1.9rem] font-bold tracking-[-0.02em] text-[var(--text)] sm:text-[2.4rem]">
              Human support, worldwide
            </h2>
            <p className="mt-4 max-w-md text-[16px] leading-relaxed text-[var(--text-muted)]">
              Our support advocates work across time zones so help is always nearby.
              Whether you have a quick question or need a hand rebuilding a workflow —
              real people who care answer fast.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/help" className="inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-full)] bg-[var(--primary)] px-5 text-[14px] font-bold text-[var(--primary-text)]">
                <LifeBuoy size={15} /> Visit Help Center
              </Link>
              <Link href="/community" className="inline-flex h-10 items-center rounded-[var(--radius-full)] border border-[var(--border-strong)] bg-[var(--surface)] px-5 text-[14px] font-bold text-[var(--text)]">
                Join the community
              </Link>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="grid grid-cols-3 gap-2">
              {["Kofi A", "Lena V", "Ravi M", "Aya S", "Nils P", "Dana R", "Priya A", "Sam I", "Tao L"].map((n) => (
                <Identicon key={n} name={n} className="aspect-square w-full rounded-[var(--radius)]" />
              ))}
            </div>
          </Reveal>
        </div>
      </Section>

      {/* 8 · resources */}
      <Section bleed tone="plain" title="Fuel your social media success" intro="Everything you need to level up your social strategy — in one place.">
        <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {RESOURCES.map((r) => (
            <StaggerItem key={r.title}>
              <Link href={r.href} className="group block h-full">
                <div className="flex h-full flex-col rounded-[var(--radius-lg)] p-5 transition-transform duration-200 group-hover:-translate-y-1" style={{ background: r.tone }}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius)] bg-[var(--surface)] text-[var(--primary)]">
                    <r.icon size={18} />
                  </span>
                  <p className="mt-3 text-[16px] font-bold text-[var(--text)]">{r.title}</p>
                  <p className="mt-1 flex-1 text-[14px] leading-relaxed text-[var(--text-muted)]">{r.body}</p>
                  <span className="mt-3 text-[13px] font-bold text-[var(--primary)]">Explore →</span>
                </div>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      {/* 9 · we are an open company */}
      <Section bleed tone="rose">
        <Reveal>
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">About us</p>
          <h2 className="mt-2 max-w-2xl text-[1.9rem] font-bold tracking-[-0.02em] text-[var(--text)] sm:text-[2.4rem]">
            We build in the open
          </h2>
          <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-[var(--text-muted)]">
            Our roadmap, changelog and metrics are public. We&apos;d rather be
            transparent and accountable than pretend we have it all figured out.
          </p>
          <Link href="/roadmap" className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-full)] border border-[var(--border-strong)] bg-[var(--surface)] px-5 text-[14px] font-bold text-[var(--text)]">
            See the roadmap <ArrowRight size={14} />
          </Link>
        </Reveal>

        <Stagger className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { n: 100, s: "K+", l: "monthly active users", stat: null as string | null },
            { n: 79871, s: "", l: "total customers", stat: null },
            { n: 73, s: "", l: "teammates", stat: null },
            { n: 0, s: "", l: "average rating", stat: "4.9" },
          ].map((x, i) => (
            <StaggerItem key={x.l} index={i}>
              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 text-center">
                <p className="text-[1.9rem] font-extrabold text-[var(--primary)]">
                  {x.stat ?? <CountUp to={x.n} suffix={x.s} />}
                </p>
                <p className="mt-1 text-[12px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{x.l}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      <CTA
        title="Grow your social presence with confidence"
        body="No card needed. Free forever plan. Connect your platforms and let MultiPost Studio run the boring parts."
        action={{ label: "Get started free", href: "/signup" }}
      />
    </main>
  );
}
