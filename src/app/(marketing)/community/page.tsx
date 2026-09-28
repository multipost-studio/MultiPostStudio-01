import type { Metadata } from "next";
import { MessageCircle, Lightbulb, MapIcon } from "lucide-react";
import { Hero, Section, FAQ, CTA } from "../_components";
import { Stagger, StaggerItem } from "@/components/motion";

export const metadata: Metadata = {
  title: "Community",
  description: "How to share feedback, request features and follow what's shipping in MultiPost Studio.",
};

const CHANNELS = [
  { icon: <MessageCircle size={17} />, title: "Talk to us directly", body: "Feedback, questions or a feature request — the fastest path is contacting us, not a public forum." },
  { icon: <Lightbulb size={17} />, title: "Feature requests", body: "We read every one. What's already landed from customer input shows up on the public roadmap." },
  { icon: <MapIcon size={17} />, title: "Follow what's shipping", body: "The changelog and roadmap are public — see what's live and what's planned before you ask." },
];

export default function CommunityPage() {
  return (
    <main>
      <Hero
        eyebrow="Resources"
        title="Community & feedback"
        subtitle="There's no public forum yet — feedback and feature requests go straight to the team, and you can see what's shipped and what's planned on the roadmap."
        primary={{ label: "Get in touch", href: "/contact?topic=feedback" }}
        secondary={{ label: "See the roadmap", href: "/roadmap" }}
      />

      <Section title="How to reach us">
        <Stagger className="grid gap-4 sm:grid-cols-3">
          {CHANNELS.map((c) => (
            <StaggerItem key={c.title}>
              <div className="h-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary-soft)] text-[var(--primary)]">
                  {c.icon}
                </span>
                <h3 className="mt-3 text-[16px] font-semibold text-[var(--text)]">{c.title}</h3>
                <p className="mt-1 text-[14px] text-[var(--text-muted)]">{c.body}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      <Section bleed tone="mint" title="FAQ" narrow>
        <FAQ
          items={[
            { q: "Is there a public forum or Discord?", a: "Not yet. Feedback and questions go through contact — it reaches the team directly instead of sitting in a queue." },
            { q: "Do I need a paid plan to give feedback?", a: "No. Anyone with a MultiPost Studio account, including the free plan, can reach out." },
            { q: "How do I request a feature?", a: "Contact us and pick “Feedback”. The roadmap shows what's already planned or shipped from requests like yours." },
          ]}
        />
      </Section>

      <CTA title="Have something to share?" body="Feedback, a bug, or a feature you wish existed — tell us." action={{ label: "Contact us", href: "/contact?topic=feedback" }} />
    </main>
  );
}
