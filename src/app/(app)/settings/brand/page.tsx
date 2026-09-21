import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
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
    // Egress: the list renders a 2-line preview per source — fetch list
    // columns only (`status` is never rendered). Full `content` still
    // transfers for the preview prefix; bounded at write time (see
    // addBrandSourceAction) so pastes can't become MB-scale rows.
    take: 50,
    select: { id: true, kind: true, title: true, content: true, createdAt: true },
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

      <SettingsSection
        title="Voice & Tone Tuning"
        description="Fine-tune per-platform voice tones, custom vocabulary, banned words, emoji frequency, and call-to-action strategies."
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
          <div>
            <h4 className="text-[14px] font-medium text-[var(--text)]">Brand Voice & Platform Tones</h4>
            <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">
              Configure tone overrides for Instagram, LinkedIn, X, TikTok, and set vocabulary preferences.
            </p>
          </div>
          <a
            href="/settings/brand/voice"
            className="inline-flex items-center justify-center gap-1.5 self-start sm:self-auto rounded-[var(--radius-md)] bg-[var(--surface-hover)] hover:bg-[var(--border)] px-3 py-1.5 text-[13px] font-medium text-[var(--text)] transition-colors border border-[var(--border)]"
          >
            Configure Voice
          </a>
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
            createdAt: s.createdAt.toISOString(),
          }))}
        />
      </SettingsSection>
    </>
  );
}
