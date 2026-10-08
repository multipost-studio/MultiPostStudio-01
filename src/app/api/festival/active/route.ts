import { NextResponse } from "next/server";
import { loadFestivalConfig } from "@/lib/festivals/store";
import { resolveFestivals } from "@/lib/festivals/resolve";

export const dynamic = "force-dynamic";

/**
 * Public, read-only: which festival theme (if any) is live right now, and how it
 * should be shown. Nothing here is private, and the CDN may cache it briefly, so a
 * busy site makes about one database read a minute for this, however many visitors.
 * Any failure answers "nothing active" so the site itself never depends on it.
 */
export async function GET() {
  try {
    const config = await loadFestivalConfig();
    const { active } = resolveFestivals(config);
    return NextResponse.json(
      { enabled: config.enabled, active, intensity: config.intensity, effects: config.effects, audience: config.audience },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch {
    return NextResponse.json({ enabled: false, active: null }, { headers: { "Cache-Control": "public, s-maxage=30" } });
  }
}
