"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/misc";

/**
 * Marketing pages are CMS/DB-backed (blog, pricing, customers, features), so a
 * transient database hiccup used to fall through to global-error.tsx — a
 * full-page dark crash screen shown to prospects. This keeps the marketing
 * shell (header, nav, footer) intact and offers a way forward instead.
 */
// `error` is intentionally not rendered: these pages are public, and raw
// messages can leak internals to anyone who trips a bug.
export default function MarketingError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-24">
      <ErrorState
        title="This page didn't load"
        description="Something went wrong on our end. It's usually temporary — try again, or head back to the homepage."
        retry={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={reset} size="sm">Try again</Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/">Back to home</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
