import Link from "next/link";
import { ArrowRight, MessageCircleQuestion } from "lucide-react";
import { Reveal } from "@/components/motion";
import { getFaqs } from "@/lib/cms";
import { PAGE_FAQS } from "@/lib/faq/data";
import { FAQ } from "./_components";

/**
 * Landing-page FAQ: the questions people ask before signing up. The set is editable from
 * Admin → Content (a `faq` entry with page "landing"); the full list lives at /faq.
 */
export async function FaqBand() {
  const items = await getFaqs("landing", PAGE_FAQS.landing);
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="faq-title" className="relative isolate overflow-hidden border-t border-[var(--border)] bg-[var(--bg)] py-16 sm:py-20">
      <div aria-hidden className="mps-rv__glow" />
      <div className="mx-auto grid max-w-6xl gap-10 px-5 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
        <Reveal className="lg:sticky lg:top-28 lg:self-start">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
            <MessageCircleQuestion size={24} aria-hidden />
          </span>
          <h2 id="faq-title" className="mt-5 text-[2rem] font-extrabold leading-[1.08] tracking-[-0.03em] text-[var(--text)] sm:text-[2.7rem]">
            Questions, answered
          </h2>
          <p className="mt-4 max-w-sm text-[16.5px] leading-relaxed text-[var(--text-muted)]">
            The short version of what people ask before they start. There&apos;s a lot more on the full FAQ, and a person on the other end of the contact page.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/faq" className="inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-5 py-3 text-[15px] font-semibold text-[var(--primary-text)] shadow-[var(--shadow)] transition-transform hover:-translate-y-0.5">
              Browse all FAQs <ArrowRight size={16} aria-hidden />
            </Link>
            <Link href="/contact" className="inline-flex items-center rounded-full border border-[var(--border-strong)] px-5 py-3 text-[15px] font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]">
              Ask us
            </Link>
          </div>
        </Reveal>
        <div className="min-w-0">
          <FAQ items={items} />
        </div>
      </div>
    </section>
  );
}
