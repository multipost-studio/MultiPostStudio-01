import Link from "next/link";
import { ArrowRight, Target } from "lucide-react";
import { getAcquisitionSummary } from "@/lib/marketing-analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";

/** Overview teaser for the Marketing module. Renders nothing if the data layer is unavailable. */
export async function AcquisitionCard() {
  const s = await getAcquisitionSummary(30);
  if (!s.ok) return null;
  const max = Math.max(...s.top.map((t) => t.signups), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Target size={15} className="text-[var(--primary)]" aria-hidden /> Acquisition · 30 days
        </CardTitle>
        <Link href="/admin/marketing" className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--primary)] hover:underline">
          Open Marketing <ArrowRight size={13} aria-hidden />
        </Link>
      </CardHeader>
      <CardContent>
        {!s.trackingHasData ? (
          <p className="text-[14px] text-[var(--text-muted)]">
            Tracking is live. Visits and signups appear here as people arrive.{" "}
            <Link href="/admin/marketing/links" className="font-medium text-[var(--primary)] hover:underline">
              Build a tracked link
            </Link>{" "}
            to measure your first campaign.
          </p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
            <dl className="grid grid-cols-3 gap-x-8 gap-y-1 sm:grid-cols-1">
              <div>
                <dt className="text-[12px] text-[var(--text-subtle)]">Visitors</dt>
                <dd className="text-[1.5rem] font-bold tabular-nums text-[var(--text)]">{formatNumber(s.visitors)}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-[var(--text-subtle)]">Signups</dt>
                <dd className="text-[1.5rem] font-bold tabular-nums text-[var(--text)]">{formatNumber(s.signups)}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-[var(--text-subtle)]">Rate</dt>
                <dd className="text-[1.5rem] font-bold tabular-nums text-[var(--text)]">{s.signupRate === null ? "—" : `${(s.signupRate * 100).toFixed(1)}%`}</dd>
              </div>
            </dl>
            <ul className="space-y-2.5" aria-label="Top channels">
              {s.top.map((t) => (
                <li key={t.key}>
                  <div className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="truncate font-medium text-[var(--text)]">{t.key}</span>
                    <span className="shrink-0 tabular-nums text-[var(--text-muted)]">
                      {formatNumber(t.signups)} signups · {formatNumber(t.visitors)} visitors
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--bg-sunken)]" aria-hidden>
                    <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${(t.signups / max) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
