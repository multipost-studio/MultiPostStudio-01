import type { Metadata } from "next";
import { Mail, MessageSquare, Building2, Clock, Users2, LifeBuoy, Newspaper } from "lucide-react";
import { Hero, Section, FeatureGrid, FAQ, CTA } from "../_components";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = { title: "Contact" };

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; role?: string }>;
}) {
  const { topic, role } = await searchParams;
  // `?role=` comes from job postings; `?topic=` from press/webinar CTAs. Only
  // accept known topics so a crafted URL can't preselect an invalid option.
  const valid = ["sales", "support", "press", "feedback"];
  const mapped = valid.includes(topic ?? "") ? topic : role ? "sales" : undefined;
  return (
    <main>
      <Hero eyebrow="Contact" title="Talk to us" subtitle="Sales questions, support, press, or just feedback — pick a lane." />
      <Section>
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6">
            {role && !topic && (
              <p className="mb-4 rounded-[var(--radius-md)] bg-[var(--primary-soft)] px-3 py-2 text-[13px] font-medium text-[var(--primary)]">
                Applying for {role} — tell us about yourself below.
              </p>
            )}
            <ContactForm initialTopic={mapped} jobSlug={role} />
          </div>
          <div className="space-y-3">
            {[
              { icon: <Mail size={15} />, title: "General", body: "multipoststudio@gmail.com" },
              { icon: <MessageSquare size={15} />, title: "Support", body: "In-app chat, or multipoststudio@gmail.com" },
              { icon: <Building2 size={15} />, title: "Enterprise", body: "multipoststudio@gmail.com" },
            ].map((c) => (
              <div key={c.title} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="flex items-center gap-2 text-[14px] font-semibold text-[var(--text)]">
                  <span className="text-[var(--primary)]">{c.icon}</span>
                  {c.title}
                </p>
                <p className="mt-1 text-[14px] text-[var(--text-muted)]">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section bleed tone="rose" title="What to expect" narrow>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: <Clock size={16} />, k: "Support", v: "Under 4 hours, business days. Under 1 hour on Team and Agency plans." },
            { icon: <Building2 size={16} />, k: "Sales", v: "A reply within one business day, and a live walkthrough within the week." },
            { icon: <Newspaper size={16} />, k: "Press", v: "Same-day acknowledgement, assets and quotes within 48 hours." },
          ].map((c) => (
            <div key={c.k} className="mps-block p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius)] bg-[var(--primary-soft)] text-[var(--primary)]">{c.icon}</span>
              <p className="mt-3 text-[15px] font-bold text-[var(--text)]">{c.k}</p>
              <p className="mt-1 text-[14px] font-medium leading-relaxed text-[var(--text-muted)]">{c.v}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Reasons people reach out">
        <FeatureGrid
          items={[
            { icon: <LifeBuoy size={17} />, title: "I'm stuck on a feature", body: "Fastest through in-app chat — an advocate can see your workspace and walk you through it.", href: "/help" },
            { icon: <Users2 size={17} />, title: "We're evaluating for a team", body: "Book a walkthrough. We'll map MultiPost Studio to your approval flow and reporting needs.", href: "/solutions/marketing-teams" },
            { icon: <Building2 size={17} />, title: "Agency / white-label questions", body: "Client workspaces, branded portals, per-client rollups — happy to demo the agency setup.", href: "/solutions/agencies" },
            { icon: <MessageSquare size={17} />, title: "Feedback or a feature request", body: "We read every one. The public roadmap shows what's landed from customer input.", href: "/roadmap" },
            { icon: <Mail size={17} />, title: "Billing or account help", body: "Plan changes, invoices, seats and exports — support handles all of it." },
            { icon: <Newspaper size={17} />, title: "Media & partnerships", body: "Boilerplate, brand assets and founder availability on the press page.", href: "/press" },
          ]}
        />
      </Section>

      <Section bleed tone="mint" title="Contact FAQ" narrow>
        <FAQ
          items={[
            { q: "Do you offer phone support?", a: "Not by default — chat and email are faster to resolve and leave a written trail. Enterprise plans can add a scheduled call line." },
            { q: "Can I get a demo before signing up?", a: "Yes. Use the form and choose “Sales”, or just start the free plan and poke around with the demo login." },
            { q: "Where are you based?", a: "Fully distributed across time zones — which is how support stays fast around the clock." },
            { q: "I found a security issue.", a: "Email multipoststudio@gmail.com directly. See the security page for our disclosure policy." },
          ]}
        />
      </Section>

      <CTA title="Rather just try it?" body="The free plan needs no card. Connect a channel and see it in five minutes." action={{ label: "Start free", href: "/signup" }} />
    </main>
  );
}
