import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { parseJson } from "@/lib/utils";
import { SettingsSection } from "../_form";
import { ApiKeysPanel, WebhooksPanel } from "./api-client";

export const metadata: Metadata = { title: "API & Webhooks" };

export default async function ApiSettingsPage() {
  const ctx = await requireWorkspace();
  const orgId = ctx.active.org.id;
  const canManage = can(ctx.active.role, "integrations.manage");

  const [keys, webhooks] = await Promise.all([
    db.apiKey.findMany({ where: { orgId }, orderBy: { createdAt: "desc" } }),
    db.webhook.findMany({ where: { orgId }, include: { deliveries: { orderBy: { createdAt: "desc" }, take: 5 } } }),
  ]);

  return (
    <>
      <SettingsSection title="API keys" description="Authenticate requests to the Cadence API. Keys are org-scoped.">
        <ApiKeysPanel
          canManage={canManage}
          keys={keys.map((k) => ({
            id: k.id,
            name: k.name,
            prefix: k.prefix,
            scopes: parseJson<string[]>(k.scopes, []),
            lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
            revoked: !!k.revokedAt,
            createdAt: k.createdAt.toISOString(),
          }))}
        />
      </SettingsSection>

      <SettingsSection title="Webhooks" description="Receive events at your endpoint. Payloads are signed with a per-hook secret.">
        <WebhooksPanel
          canManage={canManage}
          webhooks={webhooks.map((w) => ({
            id: w.id,
            url: w.url,
            events: parseJson<string[]>(w.events, []),
            active: w.active,
            deliveries: w.deliveries.map((d) => ({
              id: d.id,
              event: d.event,
              statusCode: d.statusCode,
              success: d.success,
              createdAt: d.createdAt.toISOString(),
            })),
          }))}
        />
      </SettingsSection>

      <SettingsSection title="Developer docs" description="Base URL, auth and rate limits.">
        <div className="space-y-2 text-[14px] text-[var(--text-muted)]">
          <p><span className="font-mono text-[var(--text)]">Base URL:</span> <code className="rounded bg-[var(--bg-sunken)] px-1">{"{your-domain}"}/api/v1</code></p>
          <p><span className="font-mono text-[var(--text)]">Auth:</span> <code className="rounded bg-[var(--bg-sunken)] px-1">Authorization: Bearer cad_live_…</code></p>
          <p><span className="font-mono text-[var(--text)]">Rate limit:</span> 120 req/min per key, <code>429</code> when exceeded.</p>
          <ul className="mt-1 space-y-1 font-mono text-[13px] text-[var(--text)]">
            <li>GET&nbsp; /api/v1/me</li>
            <li>GET&nbsp; /api/v1/channels<span className="text-[var(--text-subtle)]"> — scope channels:read</span></li>
            <li>GET&nbsp; /api/v1/posts<span className="text-[var(--text-subtle)]"> — scope posts:read</span></li>
            <li>POST /api/v1/posts<span className="text-[var(--text-subtle)]"> — scope posts:write</span></li>
            <li>GET&nbsp; /api/v1/posts/:id<span className="text-[var(--text-subtle)]"> — scope posts:read</span></li>
            <li>GET&nbsp; /api/v1/analytics<span className="text-[var(--text-subtle)]"> — scope analytics:read</span></li>
          </ul>
        </div>
      </SettingsSection>
    </>
  );
}
