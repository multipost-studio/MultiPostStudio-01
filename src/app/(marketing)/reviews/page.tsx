import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section, CTA, Hero, Breadcrumbs } from "../_components";
import { ReviewCard } from "@/components/reviews/review-card";
import { RatingSummary } from "@/components/reviews/summary";
import { getPublicReviews, getPublicSummary } from "@/lib/reviews/public";
import { loadReviewConfig } from "@/lib/reviews/store";
import { withShareImage } from "@/lib/branding/metadata";
import { appUrl } from "@/lib/env";
import { cn } from "@/lib/utils";



const PAGE_SIZE = 12;
const TITLE = "Customer reviews";
const DESCRIPTION = "Honest reviews from the teams and creators who plan, publish and report with MultiPost Studio.";

export async function generateMetadata(): Promise<Metadata> {
  const summary = await getPublicSummary();
  return withShareImage({
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: "/reviews" },
    // An empty page isn't worth indexing.
    robots: summary.count === 0 ? { index: false, follow: true } : undefined,
    openGraph: { title: `${TITLE} · MultiPost Studio`, description: DESCRIPTION, url: "/reviews", type: "website" },
  });
}

type Params = Promise<{ rating?: string; page?: string }>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function href(rating: number | null, page: number): string {
  const q = new URLSearchParams();
  if (rating) q.set("rating", String(rating));
  if (page > 1) q.set("page", String(page));
  const s = q.toString();
  return s ? `/reviews?${s}` : "/reviews";
}

export default async function ReviewsPage({ searchParams }: { searchParams: Params }) {
  const config = await loadReviewConfig();
  if (!config.display.page) notFound();

  const raw = await searchParams;
  const ratingParam = Number(one(raw.rating));
  const rating = Number.isInteger(ratingParam) && ratingParam >= 1 && ratingParam <= 5 ? ratingParam : null;

  const summary = await getPublicSummary();
  const matching = rating ? summary.distribution[5 - rating] : summary.count;
  const pages = Math.max(1, Math.ceil(matching / PAGE_SIZE));
  const pageParam = Math.floor(Number(one(raw.page)));
  const page = Number.isFinite(pageParam) ? Math.min(Math.max(1, pageParam), pages) : 1;
  const reviews = await getPublicReviews({ limit: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE, rating: rating ?? undefined });

  const base = appUrl().replace(/\/$/, "");
  const jsonLd =
    summary.count > 0
      ? {
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "MultiPost Studio",
          applicationCategory: "BusinessApplication",
          url: base,
          aggregateRating: { "@type": "AggregateRating", ratingValue: summary.average, reviewCount: summary.count, bestRating: 5, worstRating: 1 },
          review: reviews
            .filter((r) => r.body)
            .slice(0, 10)
            .map((r) => ({
              "@type": "Review",
              author: { "@type": "Person", name: r.authorName },
              datePublished: r.createdAt.slice(0, 10),
              reviewBody: r.body,
              ...(r.title ? { name: r.title } : {}),
              reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 },
            })),
        }
      : null;

  return (
    <main>
      <Breadcrumbs items={[{ name: TITLE, path: "/reviews" }]} />
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />}
      <Hero eyebrow="Reviews" title={TITLE} subtitle={DESCRIPTION} primary={{ label: "Start free", href: "/signup" }} secondary={{ label: "See pricing", href: "/pricing" }} />

      {summary.count === 0 ? (
        <Section narrow>
          <p className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-[16px] text-[var(--text-muted)]">
            No reviews yet. Customers can leave one from the account menu inside the app, and approved reviews appear here.
          </p>
        </Section>
      ) : (
        <Section>
          <div className="grid gap-8 lg:grid-cols-[360px_1fr] lg:items-start">
            <div className="space-y-5 lg:sticky lg:top-24">
              <RatingSummary summary={summary} />
              <nav aria-label="Filter by rating" className="flex flex-wrap gap-2">
                <Link href={href(null, 1)} aria-current={rating === null ? "page" : undefined} className={cn("rounded-full border px-3.5 py-1.5 text-[13.5px] font-semibold transition-colors", rating === null ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-hover)]" : "border-[var(--border-strong)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]")}>
                  All
                </Link>
                {[5, 4, 3, 2, 1].map((n) => (
                  <Link
                    key={n}
                    href={href(n, 1)}
                    aria-current={rating === n ? "page" : undefined}
                    className={cn("rounded-full border px-3.5 py-1.5 text-[13.5px] font-semibold transition-colors", rating === n ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-hover)]" : "border-[var(--border-strong)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]", summary.distribution[5 - n] === 0 && "pointer-events-none opacity-40")}
                  >
                    {n} ★ <span className="font-normal">({summary.distribution[5 - n]})</span>
                  </Link>
                ))}
              </nav>
              <p className="text-[12.5px] leading-relaxed text-[var(--text-subtle)]">Reviews are written by signed-in customers. We remove spam and abuse only; genuine reviews stay up, whatever the rating.</p>
            </div>

            <div>
              {reviews.length === 0 ? (
                <p className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-[var(--text-muted)]">No reviews with that rating.</p>
              ) : (
                <ul className="grid gap-5 sm:grid-cols-2">
                  {reviews.map((r) => (
                    <li key={r.id}>
                      <ReviewCard review={r} />
                    </li>
                  ))}
                </ul>
              )}
              {pages > 1 && (
                <nav aria-label="Pages" className="mt-8 flex items-center justify-between gap-3 text-[14px] font-semibold">
                  {page > 1 ? (
                    <Link href={href(rating, page - 1)} rel="prev" className="rounded-full border border-[var(--border-strong)] px-4 py-2 hover:bg-[var(--surface-hover)]">
                      ← Newer
                    </Link>
                  ) : (
                    <span />
                  )}
                  <span className="text-[var(--text-subtle)]">
                    Page {page} of {pages}
                  </span>
                  {page < pages ? (
                    <Link href={href(rating, page + 1)} rel="next" className="rounded-full border border-[var(--border-strong)] px-4 py-2 hover:bg-[var(--surface-hover)]">
                      Older →
                    </Link>
                  ) : (
                    <span />
                  )}
                </nav>
              )}
            </div>
          </div>
        </Section>
      )}
      <CTA title="Try it and tell us what you think" />
    </main>
  );
}
