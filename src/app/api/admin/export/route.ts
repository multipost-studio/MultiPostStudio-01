import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/events";

export const runtime = "nodejs";

const MAX_ROWS = 10_000;

function csv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isPlatformAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "";
  const q = (url.searchParams.get("q") ?? "").trim();

  let header: string[];
  let body: (string | number | null)[][];

  switch (type) {
    case "users": {
      const where: Record<string, unknown> = {};
      if (q) where.OR = [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }];
      const f = url.searchParams;
      if (f.get("status") === "suspended") where.suspendedAt = { not: null };
      if (f.get("status") === "active") where.suspendedAt = null;
      if (f.get("status") === "deleted") where.deletedAt = { not: null };
      if (f.get("verified") === "yes") where.emailVerified = { not: null };
      if (f.get("verified") === "no") where.emailVerified = null;
      if (f.get("admin") === "yes") where.isPlatformAdmin = true;
      const rows = await db.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: MAX_ROWS,
        include: { _count: { select: { memberships: true } } },
      });
      header = ["id", "name", "email", "verified", "platform_admin", "suspended", "deleted", "orgs", "created_at"];
      body = rows.map((u) => [
        u.id, u.name, u.email,
        u.emailVerified ? "yes" : "no",
        u.isPlatformAdmin ? "yes" : "no",
        u.suspendedAt ? "yes" : "no",
        u.deletedAt ? "yes" : "no",
        u._count.memberships,
        u.createdAt.toISOString(),
      ]);
      break;
    }
    case "orgs": {
      const where: Record<string, unknown> = {};
      if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }];
      const rows = await db.organization.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: MAX_ROWS,
        include: { subscription: { include: { plan: true } }, _count: { select: { memberships: true, workspaces: true } } },
      });
      header = ["id", "name", "slug", "type", "plan", "status", "members", "workspaces", "deleted", "created_at"];
      body = rows.map((o) => [
        o.id, o.name, o.slug, o.type,
        o.subscription?.plan.name ?? "Free",
        o.subscription?.status ?? "none",
        o._count.memberships, o._count.workspaces,
        o.deletedAt ? "yes" : "no",
        o.createdAt.toISOString(),
      ]);
      break;
    }
    case "referrals": {
      const where: Record<string, unknown> = {};
      const st = url.searchParams.get("status");
      if (st) where.status = st;
      const rows = await db.referral.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: MAX_ROWS,
        include: { referrer: { select: { email: true } }, referee: { select: { email: true } } },
      });
      header = ["id", "code", "referrer_email", "referee_email", "status", "rewarded_referrer", "rewarded_referee", "created_at"];
      body = rows.map((r) => [
        r.id, r.code, r.referrer.email, r.referee?.email ?? r.refereeEmail ?? "",
        r.status, r.rewardedReferrer ? "yes" : "no", r.rewardedReferee ? "yes" : "no", r.createdAt.toISOString(),
      ]);
      break;
    }
    case "audit": {
      const where: Record<string, unknown> = {};
      const action = url.searchParams.get("action");
      if (action) where.action = { contains: action };
      if (q) where.action = { contains: q };
      const rows = await db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: MAX_ROWS,
        include: { actor: { select: { name: true, email: true } }, org: { select: { name: true } } },
      });
      header = ["id", "created_at", "actor", "actor_email", "org", "action", "target_type", "target_id"];
      body = rows.map((l) => [
        l.id, l.createdAt.toISOString(), l.actor?.name ?? "system", l.actor?.email ?? "",
        l.org?.name ?? "", l.action, l.targetType, l.targetId,
      ]);
      break;
    }
    case "cms": {
      const rows = await db.cmsEntry.findMany({ orderBy: [{ collection: "asc" }, { sortIndex: "asc" }], take: MAX_ROWS });
      header = ["id", "collection", "slug", "published", "sort_index", "data_json", "updated_at"];
      body = rows.map((c) => [c.id, c.collection, c.slug, c.published ? "yes" : "no", c.sortIndex, c.data, c.updatedAt.toISOString()]);
      break;
    }
    default:
      return NextResponse.json({ error: "unknown export type" }, { status: 400 });
  }

  await logAudit({ actorId: user.id, action: "admin.export", targetType: "export", targetId: type, metadata: { rows: body.length, q } });

  const out = csv([header, ...body]);
  return new NextResponse(out, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
