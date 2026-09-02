import type { Metadata } from "next";
import { Hero, Section } from "../_components";
import { Reveal } from "@/components/motion";

export const metadata: Metadata = { title: "Status" };

const SYSTEMS = [
  "Web app",
  "API",
  "Publishing pipeline",
  "Webhooks",
  "AI Studio",
  "Analytics ingestion",
  "Media storage",
  "Notifications",
];

const HISTORY = [
  { date: "2026-08-19", text: "Elevated publish latency for ~12 minutes. Root cause: a slow platform API. Retries cleared the backlog." },
  { date: "2026-07-30", text: "Scheduled maintenance on the analytics store. No downtime." },
  { date: "2026-07-08", text: "Brief webhook delivery delays after a deploy. Resolved by autoscaling the delivery workers." },
];

export default function StatusPage() {
  return (
    <main>
      <Hero eyebrow="Trust" title="System status" subtitle="Current health of every Cadence subsystem." />
      <Section narrow>
        <Reveal>
          <div className="rounded-[var(--radius-lg)] border border-[var(--success)] bg-[var(--success-soft)] p-4 text-center text-[15px] font-medium text-[var(--success)]">
            All systems operational
          </div>
        </Reveal>
        <div className="mt-6 divide-y divide-[var(--border)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
          {SYSTEMS.map((s) => (
            <div key={s} className="flex items-center justify-between px-4 py-3 text-[14px]">
              <span className="text-[var(--text)]">{s}</span>
              <span className="flex items-center gap-1.5 text-[var(--success)]">
                <span className="h-2 w-2 rounded-full bg-[var(--success)]" /> Operational
              </span>
            </div>
          ))}
        </div>

        <h2 className="mt-10 text-[16px] font-semibold text-[var(--text)]">Recent incidents</h2>
        <ul className="mt-3 space-y-3">
          {HISTORY.map((h) => (
            <li key={h.date} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3 text-[14px]">
              <p className="font-medium text-[var(--text)]">{h.date}</p>
              <p className="text-[var(--text-muted)]">{h.text}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[13px] text-[var(--text-subtle)]">Uptime over the last 90 days: 99.98%.</p>
      </Section>
    </main>
  );
}
