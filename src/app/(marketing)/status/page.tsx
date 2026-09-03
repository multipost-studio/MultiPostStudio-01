import type { Metadata } from "next";
import { Hero, Section } from "../_components";
import { Reveal } from "@/components/motion";
import { db } from "@/lib/db";
import { flags } from "@/lib/env";

export const metadata: Metadata = { title: "Status" };
export const dynamic = "force-dynamic";

const DAY = 86_400_000;
const WINDOW_DAYS = 90;

// Subsystems shown on the public page. `source` maps to SystemEvent.source
// (null = derived purely from a live probe, no event history).
const SERVICES = [
  { key: "database", label: "Database", source: null as string | null },
  { key: "queue", label: "Publishing pipeline", source: "queue" },
  { key: "webhook", label: "Webhooks", source: "webhook" },
  { key: "auth", label: "Authentication", source: "auth" },
  { key: "billing", label: "Billing", source: "billing" },
  { key: "ai", label: "AI Studio", source: "ai" },
];

type DayState = "up" | "degraded" | "down";

function dayKey(t: number) {
  return new Date(t).toISOString().slice(0, 10);
}

export default async function StatusPage() {
  const now = Date.now();
  const since = new Date(now - WINDOW_DAYS * DAY);

  const [dbOk, whRecent, failedJobs, recentErr, events] = await Promise.all([
    db.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    db.webhookDelivery
      .findMany({ where: { createdAt: { gte: new Date(now - DAY) } }, select: { success: true } })
      .catch(() => [] as { success: boolean }[]),
    db.publishJob.count({ where: { status: "failed" } }).catch(() => 0),
    db.systemEvent
      .findMany({
        where: { level: "error", createdAt: { gte: new Date(now - 1_800_000) } },
        select: { source: true },
      })
      .catch(() => [] as { source: string }[]),
    db.systemEvent
      .findMany({
        where: { level: "error", createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        select: { source: true, message: true, createdAt: true },
      })
      .catch(() => [] as { source: string; message: string; createdAt: Date }[]),
  ]);

  const recentErrSources = new Set(recentErr.map((e) => e.source));
  const whOk = whRecent.filter((d) => d.success).length;
  const whHealthy = whRecent.length === 0 || whOk / whRecent.length >= 0.9;

  // error count per source per calendar day, for the 90-day strip
  const perDay = new Map<string, Map<string, number>>();
  for (const e of events) {
    const d = dayKey(e.createdAt.getTime());
    const m = perDay.get(e.source) ?? new Map<string, number>();
    m.set(d, (m.get(d) ?? 0) + 1);
    perDay.set(e.source, m);
  }

  const days = Array.from({ length: WINDOW_DAYS }, (_, i) =>
    dayKey(now - (WINDOW_DAYS - 1 - i) * DAY),
  );
  const todayKey = dayKey(now);

  function liveOk(svc: (typeof SERVICES)[number]) {
    if (svc.key === "database") return dbOk;
    if (svc.key === "queue") return !recentErrSources.has("queue") && failedJobs < 10;
    if (svc.key === "webhook") return !recentErrSources.has("webhook") && whHealthy;
    return svc.source ? !recentErrSources.has(svc.source) : true;
  }

  const rows = SERVICES.map((svc) => {
    const m = svc.source ? perDay.get(svc.source) : undefined;
    const strip: DayState[] = days.map((d) => {
      if (svc.key === "database") return d === todayKey && !dbOk ? "down" : "up";
      const n = m?.get(d) ?? 0;
      if (n >= 3) return "down";
      if (n >= 1) return "degraded";
      return "up";
    });
    if (!liveOk(svc)) strip[strip.length - 1] = "degraded";
    const ok = liveOk(svc);
    return { ...svc, ok, strip };
  });

  const allOk = rows.every((r) => r.ok);
  const badUnits = rows.reduce(
    (n, r) => n + r.strip.reduce((s, d) => s + (d === "down" ? 1 : d === "degraded" ? 0.5 : 0), 0),
    0,
  );
  const uptimePct = Math.max(0, 100 - (badUnits / (rows.length * WINDOW_DAYS)) * 100);

  const stateColor: Record<DayState, string> = {
    up: "var(--success)",
    degraded: "var(--warning)",
    down: "var(--danger)",
  };

  // one incident line per (day, source) with the latest message that day
  const seen = new Set<string>();
  const incidents = events
    .filter((e) => {
      const k = dayKey(e.createdAt.getTime()) + e.source;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 10);

  return (
    <main>
      <Hero
        eyebrow="Trust"
        title="System status"
        subtitle="Live health of every MultiPost Studio subsystem, from real probes and error telemetry."
      />
      <Section narrow>
        <Reveal>
          <div
            className="rounded-[var(--radius-lg)] border p-4 text-center text-[15px] font-medium"
            style={{
              borderColor: allOk ? "var(--success)" : "var(--warning)",
              background: allOk ? "var(--success-soft)" : "var(--warning-soft)",
              color: allOk ? "var(--success)" : "var(--warning)",
            }}
          >
            {allOk ? "All systems operational" : "Some systems degraded"}
          </div>
        </Reveal>

        <div className="mt-6 space-y-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
          {rows.map((r) => (
            <div key={r.key}>
              <div className="flex items-center justify-between text-[14px]">
                <span className="text-[var(--text)]">{r.label}</span>
                <span
                  className="flex items-center gap-1.5"
                  style={{ color: r.ok ? "var(--success)" : "var(--warning)" }}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: r.ok ? "var(--success)" : "var(--warning)" }}
                  />
                  {r.ok ? "Operational" : "Degraded"}
                </span>
              </div>
              <div className="mt-1.5 flex gap-[2px]" aria-hidden>
                {r.strip.map((d, i) => (
                  <span
                    key={i}
                    className="h-6 flex-1 rounded-[1px]"
                    style={{ background: stateColor[d] }}
                    title={`${days[i]}: ${d}`}
                  />
                ))}
              </div>
            </div>
          ))}
          <p className="flex items-center justify-between pt-1 text-[12px] text-[var(--text-subtle)]">
            <span>{WINDOW_DAYS} days ago</span>
            <span>Uptime {uptimePct.toFixed(2)}%</span>
            <span>Today</span>
          </p>
        </div>

        <h2 className="mt-10 text-[16px] font-semibold text-[var(--text)]">Recent incidents</h2>
        {incidents.length === 0 ? (
          <p className="mt-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3 text-[14px] text-[var(--text-muted)]">
            No incidents in the last {WINDOW_DAYS} days.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {incidents.map((h, i) => (
              <li
                key={i}
                className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3 text-[14px]"
              >
                <p className="font-medium text-[var(--text)]">
                  {dayKey(h.createdAt.getTime())} · {h.source}
                </p>
                <p className="text-[var(--text-muted)]">{h.message}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </main>
  );
}
