import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { flags } from "@/lib/env";
import { AI_PROVIDER_IDS, getAiProviderAdapter } from "@/lib/ai/providers/registry";
import { listAiCredentials } from "@/lib/ai/credentials";
import { SettingsSection } from "../_form";
import { AiProvidersPanel } from "./ai-client";

export const metadata: Metadata = { title: "AI Providers" };

export default async function AiProvidersPage() {
  const ctx = await requireWorkspace();
  const canManage = can(ctx.active.role, "ai.providers.manage");

  const [credentials, ws] = await Promise.all([
    listAiCredentials(ctx.active.workspace.id),
    db.workspace.findUnique({ where: { id: ctx.active.workspace.id }, select: { defaultAiProvider: true } }),
  ]);

  return (
    <>
      <SettingsSection
        title="AI Providers"
        description="Connect your own API key from a supported AI provider to use AI-powered features in MultiPost Studio. MultiPost Studio does not provide AI credits or charge for AI usage — your provider bills you directly according to their pricing."
      >
        {!flags.aiByok && (
          <p className="mb-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-sunken)] px-3 py-2 text-[13px] text-[var(--text-muted)]">
            BYOK isn&apos;t switched on for this deployment yet — keys you connect here are saved but AI features
            aren&apos;t using them until it is.
          </p>
        )}
        <AiProvidersPanel
          canManage={canManage}
          defaultProvider={ws?.defaultAiProvider ?? null}
          providers={AI_PROVIDER_IDS.map((id) => {
            const adapter = getAiProviderAdapter(id)!;
            return { id, label: adapter.label, apiKeyUrl: adapter.apiKeyUrl };
          })}
          credentials={credentials.map((c) => ({
            ...c,
            lastValidatedAt: c.lastValidatedAt?.toISOString() ?? null,
            lastUsedAt: c.lastUsedAt?.toISOString() ?? null,
          }))}
        />
      </SettingsSection>

      <SettingsSection title="How AI billing works" description="Bring Your Own Key (BYOK)">
        <p className="text-[14px] text-[var(--text-muted)]">
          MultiPost Studio uses a Bring Your Own Key model: connect your own API key from a supported AI provider,
          and AI requests are made using your credentials. Any provider charges are billed directly by that
          provider — MultiPost Studio does not provide AI credits or include AI usage in your subscription.
        </p>
      </SettingsSection>
    </>
  );
}
