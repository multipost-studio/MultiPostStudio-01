import * as React from "react";
import Link from "next/link";
import { FAQ, Section, TONES } from "./_components";
import { getFaqs } from "@/lib/cms";
import { PAGE_FAQS, type FaqItem } from "@/lib/faq/data";

/**
 * A page's FAQ section. The questions come from Admin → Content (a `faq` entry whose page is
 * `page`) and fall back to the built-in set, so an admin can reword any page without a deploy.
 * Renders nothing if there is nothing to show.
 *
 * Server-only (it reads the CMS). It lives apart from _components.tsx because a client component
 * imports that file, and the database must never be pulled into the browser bundle.
 */
export async function PageFaq({
  page,
  seed,
  title = "Frequently asked questions",
  tone,
  intro,
  children,
}: {
  page: string;
  seed?: FaqItem[];
  title?: string;
  tone?: keyof typeof TONES;
  intro?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const items = await getFaqs(page, seed ?? PAGE_FAQS[page] ?? []);
  if (items.length === 0) return null;
  return (
    <Section narrow title={title} intro={intro} bleed={!!tone} tone={tone}>
      <FAQ items={items} />
      <p className="mt-8 text-center text-[14.5px] font-medium text-[var(--text-muted)]">
        Still have a question?{" "}
        <Link href="/faq" className="font-bold text-[var(--primary)] underline-offset-2 hover:underline">
          Browse all FAQs
        </Link>{" "}
        or{" "}
        <Link href="/contact" className="font-bold text-[var(--primary)] underline-offset-2 hover:underline">
          ask us
        </Link>
        .
      </p>
      {children}
    </Section>
  );
}
