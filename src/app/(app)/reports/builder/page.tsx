import type { Metadata } from "next";
import Link from "next/link";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { hasEntitlement } from "@/lib/entitlements";
import { UpgradeRequired } from "@/components/upgrade-required";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { ReportBuilderClient } from "./builder-client";

export const metadata: Metadata = { title: "Visual Report Builder" };

export default async function ReportBuilderPage() {
  const ctx = await requireWorkspace();
  const entitled = await hasEntitlement(ctx.active.org.id, "report_builder");
  if (!entitled) {
    return <UpgradeRequired feature="Report builder" />;
  }

  const isWhiteLabelEntitled = await hasEntitlement(ctx.active.org.id, "white_label");

  const [channels, workspace] = await Promise.all([
    db.socialChannel.findMany({
      where: { workspaceId: ctx.active.workspace.id },
      select: { id: true, name: true, platform: true },
    }),
    db.workspace.findUnique({
      where: { id: ctx.active.workspace.id },
      select: { name: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Visual Report Builder"
        description="Craft bespoke executive reports with customizable analytics widgets, layout grids, and white-label branding."
        actions={
          <Button size="sm" variant="secondary" asChild>
            <Link href="/reports" className="gap-1.5">
              <ArrowLeft size={14} /> Back to Reports
            </Link>
          </Button>
        }
      />

      <ReportBuilderClient
        workspaceName={workspace?.name ?? "Workspace"}
        channels={channels}
        isWhiteLabelEntitled={isWhiteLabelEntitled}
      />
    </>
  );
}
