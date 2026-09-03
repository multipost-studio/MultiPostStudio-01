import { Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SystemPage } from "@/components/system-page";
import { Button } from "@/components/ui/button";
import { ReloadButton } from "@/components/reload-button";

export const metadata: Metadata = { title: "Scheduled maintenance" };

export default function MaintenancePage() {
  return (
    <SystemPage
      code="Maintenance"
      icon={<Wrench size={22} />}
      title="We're doing some scheduled maintenance"
      description="MultiPost Studio is briefly offline while we ship an improvement. Your scheduled posts are safe and will publish as planned. We expect to be back within the hour."
      actions={
        <>
          <ReloadButton>Check again</ReloadButton>
          <Button asChild size="md" variant="outline" className="w-full sm:w-auto">
            <Link href="/status">System status</Link>
          </Button>
        </>
      }
      footer={
        <>
          Follow along on the{" "}
          <a href="/status" className="text-[var(--primary)] hover:underline">
            status page
          </a>{" "}
          for the latest.
        </>
      }
    />
  );
}
