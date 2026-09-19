"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/misc";

/**
 * Client portal review error boundary. Magic links are opened by external clients
 * without Cadence accounts. Transient DB timeouts or rendering errors must display
 * a calm, branded fallback rather than a raw stack trace or server 500 crash.
 */
export default function PortalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-5 py-24">
      <ErrorState
        title="Unable to load review portal"
        description="We couldn't load the review session right now. This is usually temporary — please try refreshing the link or contact the workspace manager if the issue persists."
        retry={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={reset} size="sm">Try again</Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/">Cadence Home</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
