import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import { SystemPage, SystemActions } from "@/components/system-page";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <SystemPage
      code="404"
      icon={<SearchX size={22} />}
      title="We couldn't find that page"
      description="The link may be broken, or the page may have been moved or renamed. Check the address, or head back to a familiar place."
      actions={
        <SystemActions
          primary={{ href: "/dashboard", label: "Back to dashboard" }}
          secondary={{ href: "/", label: "Go to homepage" }}
        />
      }
      footer={
        <>
          Looking for something specific? Try the{" "}
          <a href="/help" className="text-[var(--primary)] hover:underline">
            help center
          </a>{" "}
          or{" "}
          <a href="/contact" className="text-[var(--primary)] hover:underline">
            contact support
          </a>
          .
        </>
      }
    />
  );
}
