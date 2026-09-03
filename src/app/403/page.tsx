import { ShieldX } from "lucide-react";
import type { Metadata } from "next";
import { SystemPage, SystemActions } from "@/components/system-page";

export const metadata: Metadata = { title: "Access denied" };

export default function ForbiddenPage() {
  return (
    <SystemPage
      code="403"
      icon={<ShieldX size={22} />}
      title="You don't have access to this"
      description="Your role in this workspace doesn't include permission for this page. If you think you should have access, ask a workspace owner or admin to update your role."
      actions={
        <SystemActions
          primary={{ href: "/dashboard", label: "Back to dashboard" }}
          secondary={{ href: "/settings/workspace", label: "View your workspace" }}
        />
      }
      footer={
        <>
          Need a permission change?{" "}
          <a href="/team" className="text-[var(--primary)] hover:underline">
            Contact a workspace admin
          </a>
          .
        </>
      }
    />
  );
}
