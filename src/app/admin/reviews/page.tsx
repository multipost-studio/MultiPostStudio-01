import type { Metadata } from "next";
import { Star } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/session";
import { logger } from "@/lib/logger";
import type { RawParams } from "@/lib/admin-query";
import { loadReviewConfig } from "@/lib/reviews/store";
import { getReviewStats, listReviews } from "@/lib/reviews/repo";
import { filtersFrom } from "./_filters";
import { ReviewsClient } from "./reviews-client";

export const metadata: Metadata = { title: "Admin · Reviews" };
export const dynamic = "force-dynamic";

export default async function AdminReviewsPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  await requirePlatformAdmin();
  const { tab, ...filters } = filtersFrom(await searchParams);
  const config = await loadReviewConfig();
  let data: { stats: Awaited<ReturnType<typeof getReviewStats>>; list: Awaited<ReturnType<typeof listReviews>> } | null = null;
  try {
    const [stats, list] = await Promise.all([getReviewStats(), listReviews(filters)]);
    data = { stats, list };
  } catch (err) {
    // Most likely the reviews tables don't exist yet (the migration runs on deploy). Say so instead of crashing.
    logger.error({ err }, "admin reviews load failed");
  }
  if (data) return <ReviewsClient initialTab={tab} filters={filters} stats={data.stats} list={data.list} initialConfig={config} />;
  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight text-[var(--text)] sm:text-[40px]">
        <Star className="h-8 w-8 shrink-0 text-[var(--primary)]" aria-hidden /> Reviews
      </h1>
      <p role="alert" className="max-w-2xl rounded-[var(--radius-lg)] border border-[var(--warning)]/30 bg-[var(--warning-soft)] p-5 text-[14.5px] leading-relaxed text-[var(--text)]">
        The reviews data couldn&apos;t be loaded. If this is a fresh deploy, the database migration <code>20261008100000_reviews</code> may not have run yet; it applies automatically as part of the build. If it already ran, check the server log for the cause.
      </p>
    </div>
  );
}
