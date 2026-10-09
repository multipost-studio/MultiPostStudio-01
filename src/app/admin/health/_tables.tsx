import * as React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDuration, type Incident } from "@/lib/health/analytics";
import type { StoredProbeResult } from "@/lib/health/types";
import { Pagination, SortHeader } from "../_controls";
import { CATEGORY_LABEL } from "./_probe-card";
import { StatusPill, fmtDateTime, fmtMs } from "./_status";
import { incidentStatusLabel } from "@/lib/incident-records";
import { IncidentManage, type IncidentFollowUp, type StaffOption } from "./_incident-manage";

const th = "px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]";
const td = "px-3 py-2.5 align-top";

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] p-10 text-center">
      <p className="text-[15px] font-semibold text-[var(--text)]">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-[13px] text-[var(--text-muted)]">{children}</p>}
    </div>
  );
}

export function HistoryTable({ rows, total, page, perPage }: { rows: StoredProbeResult[]; total: number; page: number; perPage: number }) {
  if (rows.length === 0) return <Empty title="No results match">Change or clear the filters, or run the probes to store a result.</Empty>;
  return (
    <div className="space-y-3">
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-[13.5px]">
          <thead>
            <tr>
              <th className={th}><SortHeader field="createdAt" label="Time (UTC)" /></th>
              <th className={th}><SortHeader field="name" label="Probe" /></th>
              <th className={`${th} hidden md:table-cell`}>Category</th>
              <th className={th}>Status</th>
              <th className={`${th} text-right`}><SortHeader field="latencyMs" label="Latency" /></th>
              <th className={th}>Message</th>
              <th className={`${th} hidden lg:table-cell`}>Trigger</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[var(--border)]">
                <td className={`${td} whitespace-nowrap font-mono text-[12.5px] text-[var(--text-muted)]`}>{fmtDateTime(r.createdAt)}</td>
                <td className={`${td} font-medium text-[var(--text)]`}>{r.name}</td>
                <td className={`${td} hidden text-[var(--text-muted)] md:table-cell`}>{CATEGORY_LABEL[r.category]}</td>
                <td className={td}><StatusPill status={r.status} /></td>
                <td className={`${td} text-right font-mono tabular-nums`}>{fmtMs(r.latencyMs)}</td>
                <td className={`${td} max-w-[420px] text-[var(--text-muted)]`}><span className="line-clamp-2" title={r.message}>{r.message}</span></td>
                <td className={`${td} hidden lg:table-cell`}><Badge className="text-[10px] uppercase">{r.trigger}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Pagination page={page} perPage={perPage} total={total} />
    </div>
  );
}

export type IncidentFollowUps = Record<string, IncidentFollowUp & { ownerName: string | null }>;

export function IncidentsTable({ incidents, capped, followUps = {}, staff = [], canManage = false }: { incidents: Incident[]; capped: boolean; followUps?: IncidentFollowUps; staff?: StaffOption[]; canManage?: boolean }) {
  if (incidents.length === 0) return <Empty title="No incidents">Nothing in this window went degraded or unhealthy, or nothing matches the filters.</Empty>;
  return (
    <div className="space-y-3">
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-[13.5px]">
          <thead>
            <tr>
              <th className={th}>Started (UTC)</th>
              <th className={th}>State</th>
              <th className={th}>Severity</th>
              <th className={th}>Probe</th>
              <th className={`${th} text-right`}>Duration</th>
              <th className={`${th} hidden sm:table-cell text-right`}>Checks</th>
              <th className={th}>What happened</th>
              <th className={th}>Owner / follow-up</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map((i) => (
              <tr key={i.id} className="border-t border-[var(--border)]">
                <td className={`${td} whitespace-nowrap font-mono text-[12.5px] text-[var(--text-muted)]`}>{fmtDateTime(i.startedAt)}</td>
                <td className={td}>
                  {i.resolvedAt ? (
                    <span className="text-[13px] text-[var(--text-muted)]" title={`Recovered ${fmtDateTime(i.resolvedAt)}`}>Resolved</span>
                  ) : (
                    <Badge tone="danger" className="text-[11px] uppercase">Open</Badge>
                  )}
                </td>
                <td className={td}><StatusPill status={i.severity} /></td>
                <td className={`${td} font-medium text-[var(--text)]`}>{i.name}<span className="block text-[11.5px] font-normal text-[var(--text-subtle)]">{CATEGORY_LABEL[i.category]}</span></td>
                <td className={`${td} whitespace-nowrap text-right font-mono tabular-nums`}>{formatDuration(i.durationMs)}{!i.resolvedAt && <span className="text-[var(--text-subtle)]"> so far</span>}</td>
                <td className={`${td} hidden text-right font-mono tabular-nums sm:table-cell`}>{i.checks}</td>
                <td className={`${td} max-w-[420px] text-[var(--text-muted)]`}><span className="line-clamp-2" title={i.message}>{i.message}</span></td>
                <td className={`${td} min-w-[170px]`}>
                  {followUps[i.id] ? (
                    <div className="space-y-0.5 text-[12.5px]">
                      <div className="font-medium text-[var(--text)]">{followUps[i.id].ownerName ?? "No owner"}</div>
                      <div className="text-[var(--text-muted)]">{incidentStatusLabel(followUps[i.id].status)}{followUps[i.id].postmortem ? " · postmortem written" : ""}</div>
                    </div>
                  ) : (
                    <span className="text-[12.5px] text-[var(--text-subtle)]">Unowned</span>
                  )}
                  {canManage && <IncidentManage incidentKey={i.id} title={`${i.name}: ${i.message}`.slice(0, 160)} current={followUps[i.id] ?? null} staff={staff} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {capped && <p className="text-[12.5px] text-[var(--text-subtle)]">Showing the 300 most recent incidents. Narrow the window or filters, or export for the full list.</p>}
    </div>
  );
}
