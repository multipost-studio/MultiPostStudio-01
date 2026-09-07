"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/misc";

/** Admin had a loading.tsx but no error boundary — a throw fell through to the
 *  global crash screen, losing the admin nav and any way back. */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="py-16">
      <ErrorState
        title="This admin view hit a snag"
        description={error.message || "An unexpected error occurred while loading this view."}
        retry={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={reset} size="sm">Try again</Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/admin">Admin home</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
