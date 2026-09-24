import Link from "next/link";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";

/**
 * Scoped 404 for admin console routes — keeps the admin navigation chrome
 * so administrators can easily return to /admin or other management views.
 */
export default function AdminNotFound() {
  return (
    <div className="py-16">
      <EmptyState
        icon={<Compass size={22} />}
        title="Admin view not found"
        description="The administrative page or record you requested does not exist or may have been moved."
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button asChild size="sm">
              <Link href="/admin">Back to admin overview</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/dashboard">Back to app</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
