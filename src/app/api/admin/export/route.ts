import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { logAudit } from "@/lib/events";
import { logger } from "@/lib/logger";
import { parseAdminQuery } from "@/lib/admin-query";
import { toCsv } from "@/lib/csv";
import { DATASETS } from "@/lib/admin-exports";

export const runtime = "nodejs";

const MAX_ROWS = 20_000;

/**
 * One export endpoint for every admin list: /api/admin/export?dataset=<name>&format=csv|json
 * plus the same query string the page itself uses (q, filters, from/to, sort).
 * The dataset builds its database query from the same definitions as the page,
 * so the file matches what the filtered page shows, without pagination.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isPlatformAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { enforceRateLimit, RateLimitError } = await import("@/lib/rate-limit");
  try {
    await enforceRateLimit(`admin-export:${user.id}`, 60, 3_600_000);
  } catch (e) {
    if (e instanceof RateLimitError) {
      return NextResponse.json({ error: e.message }, { status: 429, headers: { "Retry-After": "3600" } });
    }
    throw e;
  }

  const params = req.nextUrl.searchParams;
  // `dataset`, not `type`: several lists (organizations, privacy requests) have their own `type` filter.
  const type = params.get("dataset") ?? "";
  const dataset = DATASETS[type];
  if (!dataset) return NextResponse.json({ error: "unknown export type" }, { status: 400 });
  const format: "csv" | "json" = params.get("format") === "json" ? "json" : "csv";

  try {
    const query = parseAdminQuery(Object.fromEntries([...params.entries()].filter(([k]) => k !== "dataset" && k !== "format")), dataset.queryOpts);
    const { header, rows } = await dataset.load(query, MAX_ROWS + 1);
    const truncated = rows.length > MAX_ROWS;
    const body = truncated ? rows.slice(0, MAX_ROWS) : rows;

    await logAudit({
      actorId: user.id,
      action: "admin.export",
      targetType: "export",
      targetId: type,
      metadata: { rows: body.length, format, truncated, q: query.q, filters: query.filters },
    });

    const day = new Date().toISOString().slice(0, 10);
    const headers: Record<string, string> = {
      "content-disposition": `attachment; filename="${type}-${day}.${format}"`,
      "cache-control": "no-store",
    };
    if (truncated) headers["x-export-truncated"] = String(MAX_ROWS);

    if (format === "json") {
      const objects = body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] instanceof Date ? (r[i] as Date).toISOString() : (r[i] ?? null)])));
      return new NextResponse(JSON.stringify({ type, label: dataset.label, exportedAt: new Date().toISOString(), count: objects.length, truncated, rows: objects }, null, 2), {
        headers: { ...headers, "content-type": "application/json; charset=utf-8" },
      });
    }
    return new NextResponse(toCsv([header, ...body]), { headers: { ...headers, "content-type": "text/csv; charset=utf-8" } });
  } catch (e) {
    logger.error({ err: e, type }, "admin export failed");
    return NextResponse.json({ error: "export failed" }, { status: 500 });
  }
}
