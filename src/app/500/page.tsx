import { ServerCrash } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SystemPage } from "@/components/system-page";
import { Button } from "@/components/ui/button";
import { ReloadButton } from "@/components/reload-button";

export const metadata: Metadata = { title: "Something went wrong" };

export default function ServerErrorPage() {
  return (
    <SystemPage
      code="500"
      icon={<ServerCrash size={22} />}
      title="Something went wrong on our end"
      description="This wasn't your fault. The request failed unexpectedly and our team has been notified. Give it another try in a moment."
      actions={
        <>
          <ReloadButton>Try again</ReloadButton>
          <Button asChild size="md" variant="outline" className="w-full sm:w-auto">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </>
      }
      footer={
        <>
          Still stuck?{" "}
          <a href="/contact" className="text-[var(--primary)] hover:underline">
            Contact support
          </a>{" "}
          or check{" "}
          <a href="/status" className="text-[var(--primary)] hover:underline">
            system status
          </a>
          .
        </>
      }
    />
  );
}
