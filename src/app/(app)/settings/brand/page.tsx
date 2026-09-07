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
        description="Every AI generation in this workspace is given this summary, so captions and rewrites sound like you. Add your website, guidelines, and best posts."
      >
        <div className="rounded-[var(--radius-md)] bg-[var(--primary-soft)]/40 p-3">
          {/* With no sources, whatever is stored came from onboarding answers —
              calling that a "learned voice" claimed an analysis that never
              happened. The heading follows where the text actually came from. */}
          <p className="text-[13px] font-semibold uppercase text-[var(--primary)]">
            {sources.length > 0
              ? `Voice learned from ${sources.length} source${sources.length === 1 ? "" : "s"}`
              : "Starting context from your onboarding"}
          </p>
          <p className="mt-1 text-[14px] text-[var(--text-muted)]">
            {ws.brandBrain || "Nothing yet — add a source below and this fills in."}
          </p>
          {sources.length === 0 && (
            <p className="mt-2 text-[13px] text-[var(--text-subtle)]">
              This is what you told us during setup, not an analysis of your writing. Add a source
              below to replace it with a summary drawn from your own material.
            </p>
          )}
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
