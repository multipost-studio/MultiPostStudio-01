import Link from "next/link";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";

/**
 * Scoped 404 for client review portals — external clients opening an invalid
 * or expired review link receive a calm, branded message rather than an internal error.
 */
export default function PortalNotFound() {
  return (
    <div className="mx-auto max-w-xl px-5 py-24">
      <EmptyState
        icon={<Compass size={22} />}
        title="Review link expired or not found"
        description="This review portal link is invalid or has expired. Please contact your account manager for a new link."
        action={
          <Button asChild size="sm" variant="ghost">
            <Link href="/">MultiPost Studio Home</Link>
          </Button>
        }
      />
    </div>
  );
}
