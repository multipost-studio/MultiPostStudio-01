import { Reveal } from "@/components/motion";
import { loadBranding } from "@/lib/branding/store";
import { loadStatCounts, resolveStats } from "@/lib/branding/stats";

/**
 * Public platform stats, controlled from Admin → Site Branding → Platform Stats.
 * Automatic stats are live counts from this deployment's own database (never
 * typed in), manual ones show exactly what the admin entered, and the whole strip
 * stays hidden unless the admin switched it on and at least one number qualifies.
 */
export async function PlatformStats() {
  const branding = await loadBranding();
  if (!branding.stats.enabled) return null;
  const stats = resolveStats(branding.stats, await loadStatCounts());
  if (!stats) return null;

  return (
    <section aria-label={stats.title || "Platform stats"} className="border-y border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:py-14">
        <Reveal>
          {stats.title && <p className="text-center text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--text-subtle)]">{stats.title}</p>}
          <dl className="mt-6 grid grid-cols-2 gap-y-8 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
            {stats.items.map((s) => (
              <div key={s.id} className="px-3 text-center">
                <dd className="text-[34px] font-extrabold leading-none tracking-tight text-[var(--text)] tabular-nums sm:text-[44px]">
                  <span className="text-[var(--primary)]">{s.value}</span>
                </dd>
                <dt className="mt-2 text-[14px] text-[var(--text-muted)]">{s.label}</dt>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}
