import type { Metadata } from "next";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getFacets } from "@/lib/marketing-analytics";
import { normalizeSegmentFilter } from "@/lib/audience";
import { MarketingSubNav } from "../_sub-nav";
import { AudiencesClient, type SavedSegment } from "./audiences-client";

export const metadata: Metadata = { title: "Admin · Audiences" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const csv = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(",") : (v ?? "")).split(",").map((s) => s.trim()).filter(Boolean);

export default async function AdminAudiencesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  // Deep links from the Acquisition report ("Target this audience") arrive as query params.
  const initial = normalizeSegmentFilter({
    channels: csv(sp.channels),
    sources: csv(sp.sources),
    mediums: csv(sp.mediums),
    campaigns: csv(sp.campaigns),
    plans: csv(sp.plans),
    touch: sp.touch === "last" ? "last" : "first",
  });

  let saved: SavedSegment[] = [];
  let plans: { key: string; name: string }[] = [];
  try {
    const [segs, planRows] = await Promise.all([
      db.marketingSegment.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
      db.plan.findMany({ select: { key: true, name: true }, orderBy: { sortIndex: "asc" } }),
    ]);
    saved = segs.map((s) => ({ id: s.id, name: s.name, filter: normalizeSegmentFilter(s.filter) }));
    plans = planRows;
  } catch (err) {
    logger.warn({ err }, "audiences page: saved segments unavailable");
  }
  const facets = await getFacets();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Marketing</h1>
        <p className="mt-1 text-[14px] text-[var(--text-muted)]">
          Build an audience from how people found you, see who is in it, then message them, export them, or show them a targeted promo card.
        </p>
      </div>
      <MarketingSubNav />
      <AudiencesClient initial={initial} saved={saved} facets={facets} plans={plans} />
    </div>
  );
}
