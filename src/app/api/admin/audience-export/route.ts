import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { logAudit } from "@/lib/events";
import { logger } from "@/lib/logger";
import { toCsv } from "@/lib/csv";
import { describeFilter, normalizeSegmentFilter } from "@/lib/audience";
import { resolveAudience } from "@/lib/marketing-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CSV of an audience (admin only, rate-limited, audit-logged). Contains
 * personal data, so it is deliberately limited to what a campaign needs:
 * name, email, plan, how they arrived and when they signed up.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  // Support-tier admins are confined to /admin/support by the proxy; enforce it here too.
  if (!user?.isPlatformAdmin || user.platformRole === "support") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { enforceRateLimit, RateLimitError } = await import("@/lib/rate-limit");
  try {
    await enforceRateLimit(`admin-audience-export:${user.id}`, 10, 3_600_000);
  } catch (e) {
    if (e instanceof RateLimitError) return NextResponse.json({ error: e.message }, { status: 429, headers: { "Retry-After": "3600" } });
    throw e;
  }

  const filter = normalizeSegmentFilter(new URL(req.url).searchParams.get("f"));
  try {
    const a = await resolveAudience(filter);
    const rows = [
      ["name", "email", "plan", "channel", "source", "campaign", "signed_up"],
      ...a.members.map((m) => [m.name, m.email, m.plan, m.channel, m.source, m.campaign, m.createdAt]),
    ];
    await logAudit({ actorId: user.id, action: "marketing.audience_export", targetType: "MarketingSegment", targetId: "adhoc", metadata: { rows: a.members.length, audience: describeFilter(filter) } });
    return new NextResponse(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audience-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logger.error({ err }, "audience export failed");
    return NextResponse.json({ error: "export failed" }, { status: 500 });
  }
}
