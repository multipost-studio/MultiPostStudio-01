import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, hasAdminPermission } from "@/lib/session";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/events";
import { logger } from "@/lib/logger";
import { toCsv, type CsvCell } from "@/lib/csv";
import { deriveIncidents, filterIncidents } from "@/lib/health/analytics";
import { CONFIG_KEY, loadHealthConfig } from "@/lib/health/config-store";
import { historyWhere, loadRangeRows, parseHistoryFilters, toStored } from "@/lib/health/history";
import { runSystemHealthProbes } from "@/lib/health/run";
import { RANGES, RANGE_MS, type HealthRange } from "@/lib/health/types";

export const runtime = "nodejs";

const MAX_ROWS = 50_000;

const SCOPES = ["history", "incidents", "report", "config"] as const;
type Scope = (typeof SCOPES)[number];

function download(body: string, type: "csv" | "json", name: string, extra: Record<string, string> = {}) {
  return new NextResponse(body, {
    headers: {
      "content-type": type === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.${type}"`,
      "cache-control": "no-store",
      ...extra,
    },
  });
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !(await hasAdminPermission("data.export")) || !(await hasAdminPermission("system.view"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { enforceRateLimit, RateLimitError } = await import("@/lib/rate-limit");
  try {
    await enforceRateLimit(`admin-health-export:${user.id}`, 30, 3_600_000);
  } catch (e) {
    if (e instanceof RateLimitError) return NextResponse.json({ error: e.message }, { status: 429, headers: { "Retry-After": "3600" } });
    throw e;
  }

  const p = req.nextUrl.searchParams;
  const scope = (p.get("scope") ?? "history") as Scope;
  if (!SCOPES.includes(scope)) return NextResponse.json({ error: "unknown scope" }, { status: 400 });
  const format: "csv" | "json" = p.get("format") === "json" ? "json" : "csv";
  const filters = parseHistoryFilters((k) => p.get(k));
  const rangeParam = p.get("range") as HealthRange | null;
  const range: HealthRange = rangeParam && (RANGES as readonly string[]).includes(rangeParam) ? rangeParam : "7d";

  try {
    let response: NextResponse;
    let rows = 0;

    if (scope === "config") {
      const config = await loadHealthConfig();
      rows = 1;
      response = download(JSON.stringify({ app: "multipost-studio", kind: "health-config", exportedAt: new Date().toISOString(), config }, null, 2), "json", "health-config");
    } else if (scope === "report") {
      const report = await runSystemHealthProbes();
      const text = filters.q.toLowerCase();
      const probes = report.probes.filter(
        (x) =>
          (!filters.statuses.length || filters.statuses.includes(x.status)) &&
          (!filters.categories.length || filters.categories.includes(x.category)) &&
          (!filters.probes.length || filters.probes.includes(x.id)) &&
          (!text || `${x.name} ${x.message}`.toLowerCase().includes(text)),
      );
      rows = probes.length;
      response =
        format === "json"
          ? download(JSON.stringify({ ...report, probes }, null, 2), "json", "health-report")
          : download(
              toCsv([
                ["checked_at", "probe_id", "probe", "category", "status", "muted", "latency_ms", "message", "details_json"],
                ...probes.map((x): CsvCell[] => [x.checkedAt, x.id, x.name, x.category, x.status, x.muted ? "yes" : "no", x.latencyMs ?? "", x.message, x.details ? JSON.stringify(x.details) : ""]),
              ]),
              "csv",
              "health-report",
            );
    } else if (scope === "incidents") {
      const to = new Date();
      const from = filters.from ?? new Date(to.getTime() - RANGE_MS[range]);
      const { rows: results } = await loadRangeRows(from, filters.to ?? to, filters.probes);
      const state = p.get("state") === "open" ? "open" : p.get("state") === "resolved" ? "resolved" : "";
      const incidents = filterIncidents(deriveIncidents(results, to.getTime()), { severities: filters.statuses, categories: filters.categories, probes: filters.probes, state, q: filters.q });
      rows = incidents.length;
      response =
        format === "json"
          ? download(JSON.stringify({ exportedAt: to.toISOString(), from: from.toISOString(), count: rows, incidents }, null, 2), "json", "health-incidents")
          : download(
              toCsv([
                ["started_at", "resolved_at", "state", "severity", "probe_id", "probe", "category", "duration_seconds", "checks", "message"],
                ...incidents.map((i): CsvCell[] => [i.startedAt, i.resolvedAt ?? "", i.resolvedAt ? "resolved" : "open", i.severity, i.probeId, i.name, i.category, Math.round(i.durationMs / 1000), i.checks, i.message]),
              ]),
              "csv",
              "health-incidents",
            );
    } else {
      const found = await db.healthProbeRun.findMany({
        where: historyWhere(filters),
        orderBy: { createdAt: "desc" },
        take: MAX_ROWS + 1,
        select: { id: true, runId: true, probeId: true, name: true, category: true, status: true, latencyMs: true, message: true, trigger: true, createdAt: true },
      });
      const truncated = found.length > MAX_ROWS;
      const results = (truncated ? found.slice(0, MAX_ROWS) : found).map(toStored);
      rows = results.length;
      const extra: Record<string, string> = truncated ? { "x-export-truncated": String(MAX_ROWS) } : {};
      response =
        format === "json"
          ? download(JSON.stringify({ exportedAt: new Date().toISOString(), count: rows, truncated, results }, null, 2), "json", "health-history", extra)
          : download(
              toCsv([
                ["time", "probe_id", "probe", "category", "status", "latency_ms", "message", "trigger", "run_id"],
                ...results.map((r): CsvCell[] => [r.createdAt, r.probeId, r.name, r.category, r.status, r.latencyMs ?? "", r.message, r.trigger, r.runId]),
              ]),
              "csv",
              "health-history",
              extra,
            );
    }

    await logAudit({ actorId: user.id, action: "admin.health_export", targetType: "export", targetId: scope === "config" ? CONFIG_KEY : `health_${scope}`, metadata: { scope, format, rows } });
    return response;
  } catch (err) {
    logger.error({ err, scope }, "health export failed");
    return NextResponse.json({ error: "export failed" }, { status: 500 });
  }
}
