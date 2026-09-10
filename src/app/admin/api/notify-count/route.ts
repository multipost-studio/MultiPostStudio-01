import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getAdminModuleBadges } from "@/lib/admin-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Polled by the admin shell every ~45s to keep the sidebar badges and the
 * header bell current without a full navigation. Returns only the badge map,
 * not the item list.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isPlatformAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const badges = await getAdminModuleBadges(user.id);
  return NextResponse.json(badges, { headers: { "cache-control": "no-store" } });
}
