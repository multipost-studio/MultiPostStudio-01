"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/misc";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // In production, forward to an error tracker here.
  }, [error]);

  return (
    <div className="py-16">
      <ErrorState
        title="This page hit a snag"
        description="An unexpected error occurred while loading this view. Please try again."
        retry={<Button onClick={reset} size="sm">Try again</Button>}
      />
      {error.digest && (
        <p className="mt-3 text-center text-[12px] text-[var(--text-subtle)]">Error ID: {error.digest}</p>
      )}
    </div>
  );
}
