import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { relativeTime } from "@/lib/utils";
import { SettingsSection } from "../_form";
import { BrandSources } from "./brand-sources";

export const metadata: Metadata = { title: "Brand Brain" };

export default async function BrandBrainPage() {
  const ctx = await requireWorkspace();
  const ws = ctx.active.workspace;
  const canManage = can(ctx.active.role, "workspace.manage");
  const sources = await db.brandSource.findMany({
    where: { workspaceId: ws.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <SettingsSection
        title="Brand Brain"
        description="Cadence's AI uses this to keep every generation on-brand. Add your website, guidelines, and best posts."
      >
        <div className="rounded-[var(--radius-md)] bg-[var(--primary-soft)]/40 p-3">
          <p className="text-[13px] font-semibold uppercase text-[var(--primary)]">Current learned voice</p>
          <p className="mt-1 text-[14px] text-[var(--text-muted)]">
            {ws.brandBrain || "Not enough source material yet — add a few sources below."}
          </p>
        </div>
      </SettingsSection>

      <SettingsSection title="Sources" description="Documents and examples the Brand Brain learns from.">
        <BrandSources
          canManage={canManage}
          sources={sources.map((s) => ({
            id: s.id,
            kind: s.kind,
            title: s.title,
            content: s.content,
            status: s.status,
            createdAt: s.createdAt.toISOString(),
          }))}
        />
      </SettingsSection>
    </>
  );
}
