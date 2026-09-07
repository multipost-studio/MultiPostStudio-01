"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/misc";

/**
 * A throw during sign-in/sign-up previously showed the global crash screen,
 * which gives the user no way back into the auth flow. The auth layout (logo,
 * showcase panel) sits outside this boundary and still renders.
 */
// `error` is intentionally not rendered — unauthenticated page, no internals.
export default function AuthError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      title="We couldn't load this step"
      description="Something went wrong signing you in. Your account is unaffected — try again."
      retry={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button onClick={reset} size="sm">Try again</Button>
          <Button asChild size="sm" variant="ghost">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>
      }
    />
  );
}
