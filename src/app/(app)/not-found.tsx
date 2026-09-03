import Link from "next/link";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";

/**
 * Scoped 404 for routes under the app shell — keeps the sidebar/header so the
 * user still has their workspace navigation, unlike the full-viewport root 404.
 */
export default function AppNotFound() {
  return (
    <div className="py-14">
      <EmptyState
        icon={<Compass size={22} />}
        title="This page isn't here"
        description="The link may be outdated or the item may have been deleted. Everything in your workspace is reachable from the sidebar."
        action={
          <Button asChild size="sm">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        }
      />
    </div>
  );
}
