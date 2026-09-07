import { ServerCrash } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SystemPage } from "@/components/system-page";
import { Button } from "@/components/ui/button";
import { ReloadButton } from "@/components/reload-button";

export const metadata: Metadata = { title: "Bad gateway" };

/**
 * 502 sits alongside 503: 503 is "we're overloaded or in maintenance", 502 is
 * "an upstream hop returned a bad response". Users can't tell them apart, so
 * the copy stays about what they can do rather than which hop failed.
 */
export default function BadGatewayPage() {
  return (
    <SystemPage
      code="502"
      icon={<ServerCrash size={22} />}
      title="We couldn't reach MultiPost Studio"
      description="A server in front of the app returned an invalid response. Your posts, schedule and connected accounts are unaffected — this is almost always resolved within a minute or two."
      actions={
        <>
          <ReloadButton>Try again</ReloadButton>
          <Button asChild size="md" variant="outline" className="w-full sm:w-auto">
            <Link href="/status">View system status</Link>
          </Button>
        </>
      }
      footer={
        <>
          Still stuck after a few minutes?{" "}
          <a href="/contact" className="text-[var(--primary)] hover:underline">
            Contact support
          </a>
          .
        </>
      }
    />
  );
}
