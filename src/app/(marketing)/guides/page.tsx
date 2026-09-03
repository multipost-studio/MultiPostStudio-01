import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Lightbulb, CalendarClock, BarChart3, Users2, Sparkles } from "lucide-react";
import { Hero, Section, FeatureGrid, CTA } from "../_components";
import { Stagger , StaggerItem} from "@/components/motion";
import { getGuides } from "@/lib/cms";

export const metadata: Metadata = { title: "Guides" };

export default async function GuidesPage() {
  const GUIDES = await getGuides();
  return (
    <main>
      <Hero
        eyebrow="Resources"
        title="Guides"
        subtitle="Longer reads on doing social media well — frameworks, checklists and playbooks you can actually use, not listicles."
        primary={{ label: "Start free", href: "/signup" }}
        secondary={{ label: "Free tools", href: "/tools" }}
      />

      <Section title="Browse by topic" intro="Every guide is practical: a framework, an example, and the steps to apply it this week.">
        <FeatureGrid
          items={[
            { icon: <Lightbulb size={17} />, title: "Strategy & positioning", body: "Find your angle, pick your platforms, and decide what not to do.", href: "/guides" },
            { icon: <Sparkles size={17} />, title: "Content & creation", body: "Hooks, formats, batching, and repurposing one idea across channels.", href: "/guides" },
            { icon: <CalendarClock size={17} />, title: "Planning & scheduling", body: "Content pillars, calendars, and posting cadence that sticks.", href: "/guides" },
            { icon: <Users2 size={17} />, title: "Community & engagement", body: "Reply routines, tone, and turning comments into reach.", href: "/guides" },
            { icon: <BarChart3 size={17} />, title: "Analytics & reporting", body: "Which metrics matter, how to read them, and what to change.", href: "/guides" },
            { icon: <BookOpen size={17} />, title: "Fundamentals (101)", body: "New to social? Start here for the vocabulary and the basics.", href: "/guides" },
          ]}
        />
      </Section>

      <Section bleed tone="rose" title="All guides">
        <Stagger className="grid gap-4 md:grid-cols-2">
          {GUIDES.map((g) => (
            <StaggerItem key={g.slug}>
              <Link
                href={`/guides/${g.slug}`}
                className="flex h-full gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 transition-colors hover:border-[var(--primary)]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary-soft)] text-[var(--primary)]">
                  <BookOpen size={16} />
                </span>
                <div>
                  <p className="text-[16px] font-semibold text-[var(--text)]">{g.title}</p>
                  <p className="mt-1 text-[14px] text-[var(--text-muted)]">{g.summary}</p>
                  <p className="mt-2 text-[12px] text-[var(--text-subtle)]">{g.minutes} min read</p>
                </div>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      <Section title="How to get the most from a guide" narrow>
        <ol className="space-y-3 text-[15.5px] font-medium leading-relaxed text-[var(--text)]">
          <li><span className="font-bold text-[var(--primary)]">1. </span>Read it once through, then pick the single change with the highest leverage for you right now.</li>
          <li><span className="font-bold text-[var(--primary)]">2. </span>Put it into your next week of posts — don&apos;t wait for a &quot;fresh start&quot;.</li>
          <li><span className="font-bold text-[var(--primary)]">3. </span>Check the result after ~10 posts. If it worked, systemise it. If not, try the next idea.</li>
        </ol>
        <p className="mt-4 text-[14px] text-[var(--text-muted)]">
          Prefer to just do it? MultiPost Studio bakes most of these frameworks — pillars, cadence, health score — into
          the product. <Link href="/features" className="font-semibold text-[var(--primary)] underline">See how</Link>.
        </p>
      </Section>

      <CTA title="Turn a guide into a habit" body="MultiPost Studio keeps your pillars, cadence and goals in front of you every day — free to start." action={{ label: "Get started free", href: "/signup" }} />
    </main>
  );
}
