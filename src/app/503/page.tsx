import { CloudOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SystemPage } from "@/components/system-page";
import { Button } from "@/components/ui/button";
import { ReloadButton } from "@/components/reload-button";

export const metadata: Metadata = { title: "Service temporarily unavailable" };

export default function ServiceUnavailablePage() {
  return (
    <SystemPage
      code="503"
      icon={<CloudOff size={22} />}
      title="MultiPost Studio is temporarily unavailable"
      description="A service we depend on is having trouble, or we're handling more traffic than usual. This is usually brief — try again shortly."
      actions={
        <>
          <ReloadButton>Retry now</ReloadButton>
          <Button asChild size="md" variant="outline" className="w-full sm:w-auto">
            <Link href="/status">View system status</Link>
          </Button>
        </>
      }
      footer={
        <>
          We post live updates on the{" "}
          <a href="/status" className="text-[var(--primary)] hover:underline">
            status page
          </a>
          .
        </>
      }
    />
  );
}
