import type { Metadata } from "next";
import { ShieldCheck, Lock, KeyRound, ScrollText, Server, Users } from "lucide-react";
import { Hero, Section, CTA } from "../_components";
import { Stagger , StaggerItem} from "@/components/motion";

export const metadata: Metadata = { title: "Security" };

const PRACTICES = [
  { icon: <Lock size={17} />, title: "Encryption everywhere", body: "TLS in transit, encryption at rest. Platform tokens are stored encrypted and scoped per workspace." },
  { icon: <KeyRound size={17} />, title: "Access control", body: "Org and workspace roles with a real permission matrix. SSO and SCIM on Enterprise." },
  { icon: <ScrollText size={17} />, title: "Audit trail", body: "An immutable log of security- and billing-sensitive actions, exportable on Enterprise." },
  { icon: <Server size={17} />, title: "Isolation", body: "Every workspace's data is queried with a workspace filter. No cross-tenant reads." },
  { icon: <Users size={17} />, title: "Least privilege", body: "Team members get the minimum access their role needs; consequential actions ask first." },
  { icon: <ShieldCheck size={17} />, title: "Responsible disclosure", body: "Found something? Email security@cadence.example. We respond within one business day." },
];

export default function SecurityPage() {
  return (
    <main>
      <Hero eyebrow="Trust" title="Security at Cadence" subtitle="How we protect your accounts, your content and your customers' conversations." />
      <Section>
        <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PRACTICES.map((p) => (
            <StaggerItem key={p.title}>
              <div className="h-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary-soft)] text-[var(--primary)]">
                  {p.icon}
                </span>
                <h3 className="mt-3 text-[16px] font-semibold text-[var(--text)]">{p.title}</h3>
                <p className="mt-1 text-[14px] text-[var(--text-muted)]">{p.body}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>
      <Section narrow>
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 text-[14px] text-[var(--text-muted)]">
          <p className="font-semibold text-[var(--text)]">Compliance</p>
          <p className="mt-1">
            SOC 2 Type II and a signable DPA are available for Team and Enterprise customers. Sub-processor
            list and pen-test summary available under NDA — <a href="/contact" className="text-[var(--primary)] underline">request them here</a>.
          </p>
        </div>
      </Section>
      <CTA />
    </main>
  );
}
