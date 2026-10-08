import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Reveal } from "@/components/motion";
import { ReviewCard } from "@/components/reviews/review-card";
import { RatingSummary } from "@/components/reviews/summary";
import { getPublicReviews, getPublicSummary } from "@/lib/reviews/public";
import { loadReviewConfig } from "@/lib/reviews/store";
import type { PublicReview, ReviewSummary } from "@/lib/reviews/model";

/**
 * Landing-page reviews band. Everything on it is a real, approved review from the
 * database: with none, the whole section is absent (we never show placeholder praise).
 * Reviews drift past in two rows moving opposite ways; with only a handful they sit in
 * a still grid instead, so a loop never repeats the same card side by side.
 */

const MIN_FOR_MARQUEE = 5;

function repeatTo<T>(list: T[], n: number): T[] {
  if (list.length === 0) return list;
  const out: T[] = [];
  while (out.length < n) out.push(...list);
  return out;
}

function Row({ items, reverse }: { items: PublicReview[]; reverse?: boolean }) {
  const base = repeatTo(items, 6);
  return (
    <div className="mps-rv-row">
      <ul className={`mps-rv-track ${reverse ? "mps-rv-track--reverse" : ""}`}>
        {[...base, ...base].map((r, i) => (
          <li key={`${r.id}-${i}`} aria-hidden={i >= base.length || undefined} className="mps-rv-item">
            <ReviewCard review={r} clamp />
          </li>
        ))}
      </ul>
    </div>
  );
}

export async function ReviewsSection() {
  const config = await loadReviewConfig();
  if (!config.display.landing) return null;
  const [summary, reviews] = await Promise.all([getPublicSummary(), getPublicReviews({ limit: config.display.landingCount })]);
  if (summary.count === 0 || reviews.length === 0) return null;
  return <ReviewsBand summary={summary} reviews={reviews} showAllLink={config.display.page} />;
}

/** The band itself, from plain data (so it can be previewed and tested without a database). */
export function ReviewsBand({ summary, reviews, showAllLink }: { summary: ReviewSummary; reviews: PublicReview[]; showAllLink: boolean }) {
  const marquee = reviews.length >= MIN_FOR_MARQUEE;
  const half = Math.ceil(reviews.length / 2);

  return (
    <section aria-labelledby="reviews-title" className="mps-rv relative isolate overflow-hidden border-y border-[var(--border)] bg-[var(--bg-sunken)] py-16 sm:py-20">
      <div aria-hidden className="mps-rv__glow" />
      <div className="mx-auto grid max-w-6xl gap-10 px-5 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <Reveal>
          <p className="mps-eyebrow">
            <span className="dot" aria-hidden />
            Customer reviews
          </p>
          <h2 id="reviews-title" className="mt-4 text-[2rem] font-extrabold leading-[1.08] tracking-[-0.03em] text-[var(--text)] sm:text-[2.8rem]">
            Real reviews, straight from the people who use it
          </h2>
          <p className="mt-4 max-w-md text-[16.5px] leading-relaxed text-[var(--text-muted)]">
            Written by signed-in customers and moderated only for spam and abuse. Good or critical, every genuine review stays up.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {showAllLink && (
              <Link href="/reviews" className="inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-5 py-3 text-[15px] font-semibold text-[var(--primary-text)] shadow-[var(--shadow)] transition-transform hover:-translate-y-0.5">
                Read all reviews <ArrowRight size={16} aria-hidden />
              </Link>
            )}
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--text-subtle)]">
              <ShieldCheck size={15} aria-hidden /> Only customers can review
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.08}>
          <RatingSummary summary={summary} />
        </Reveal>
      </div>

      {marquee ? (
        <div className="mps-rv-marquee mt-12" role="presentation">
          <Row items={reviews.slice(0, half)} />
          <Row items={reviews.slice(half)} reverse />
        </div>
      ) : (
        <ul className="mx-auto mt-12 grid max-w-6xl gap-5 px-5 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.map((r) => (
            <li key={r.id}>
              <ReviewCard review={r} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
