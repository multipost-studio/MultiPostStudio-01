import type { Metadata } from "next";
import Link from "next/link";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { hasEntitlement } from "@/lib/entitlements";
import { appUrl } from "@/lib/env";
import { parseJson, relativeTime } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { mcpUrl } from "@/lib/mcp/oauth";
import { PageHeader } from "@/components/page-header";
import { AiAssistants, type ConnectedApp, type ActivityRow } from "./ai-client";

export const metadata: Metadata = { title: "AI assistants" };
export const dynamic = "force-dynamic";

const ACTIVITY_LABEL: Record<string, string> = { "ai.tool_call": "used", "ai.connected": "was connected", "ai.disconnected": "was disconnected" };

export default async function AiAssistantsPage() {
  const ctx = await requireWorkspace();
  const orgId = ctx.active.org.id;
  const canManage = can(ctx.active.role, "integrations.manage");
  const entitled = await hasEntitlement(orgId, "api_access");

  // Connections made with the sign-in screen, and what assistants did. This page must still open if these tables aren't there yet.
  let apps: ConnectedApp[] = [];
  let activity: ActivityRow[] = [];
  // Who connected what, and what assistants did, is for people who can manage connections; others only see the setup steps.
  if (canManage) try {
    const [tokens, logs] = await Promise.all([
      db.oAuthToken.findMany({
        where: { orgId, revokedAt: null, refreshExpiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, workspaceId: true, scopes: true, createdAt: true, lastUsedAt: true, client: { select: { name: true } }, user: { select: { name: true } } },
      }),
      db.auditLog.findMany({
        where: { orgId, action: { startsWith: "ai." } },
        orderBy: { createdAt: "desc" },
        take: 15,
        select: { id: true, action: true, targetId: true, metadata: true, createdAt: true },
      }),
    ]);
    const wsIds = [...new Set(tokens.map((t) => t.workspaceId).filter((v): v is string => !!v))];
    const names = new Map((wsIds.length ? await db.workspace.findMany({ where: { id: { in: wsIds } }, select: { id: true, name: true } }) : []).map((w) => [w.id, w.name]));
    apps = tokens.map((t) => ({
      id: t.id,
      name: t.client.name,
      by: t.user.name,
      where: t.workspaceId ? (names.get(t.workspaceId) ?? "One workspace") : "All workspaces",
      scopes: parseJson<string[]>(t.scopes, []),
      connected: relativeTime(t.createdAt),
      lastUsed: t.lastUsedAt ? relativeTime(t.lastUsedAt) : null,
    }));
    activity = logs.map((l) => {
      const meta = parseJson<{ client?: string; ok?: boolean }>(l.metadata ?? "{}", {});
      const who = meta.client ?? l.targetId;
      const verb = ACTIVITY_LABEL[l.action] ?? l.action;
      return { id: l.id, text: l.action === "ai.tool_call" ? `${who} ${verb} ${l.targetId}${meta.ok === false ? " (it failed)" : ""}` : `${l.targetId} ${verb}`, when: relativeTime(l.createdAt) };
    });
  } catch (e) {
    logger.warn({ err: e }, "ai assistants page: could not load connections or activity");
  }

  return (
    <>
      <PageHeader title="AI assistants" description="Let Claude, ChatGPT, Cursor and other AI tools see your channels and posts, and draft or schedule posts, without leaving the chat." wash="c" />

      {!entitled && (
        <div role="note" className="mb-6 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 text-[14px] text-[var(--text-muted)]">
          AI assistant access isn&apos;t included in your current plan.{" "}
          <Link href="/settings/billing" className="font-medium text-[var(--primary)] hover:underline">
            See plans
          </Link>
        </div>
      )}

      <AiAssistants
        serverUrl={mcpUrl()}
        openApiUrl={appUrl("/api/v1/openapi.json")}
        canManage={canManage && entitled}
        apps={apps}
        activity={activity}
      />
    </>
  );
}
