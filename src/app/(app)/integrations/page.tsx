import type { Metadata } from "next";
import Link from "next/link";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { socialProviders } from "@/lib/env";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { PlatformBadge } from "@/components/brand";
import { relativeTime } from "@/lib/utils";
import { ConnectAccount, AccountActions } from "./integrations-client";

export const metadata: Metadata = { title: "Integrations" };

const CATALOG = [
  { name: "Google Drive", desc: "Attach assets straight from Drive", cat: "Storage" },
  { name: "Dropbox", desc: "Import media from Dropbox folders", cat: "Storage" },
  { name: "OneDrive", desc: "Pull files from OneDrive", cat: "Storage" },
  { name: "Canva", desc: "Design and send to the composer", cat: "Design" },
  { name: "Zapier", desc: "5,000+ app automations via webhooks", cat: "Automation" },
  { name: "Make", desc: "Visual automation scenarios", cat: "Automation" },
  { name: "Slack", desc: "Approval and publish notifications in Slack", cat: "Comms" },
  { name: "Webhooks", desc: "Send events to any endpoint", cat: "Developer", href: "/settings/api" },
];

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const ctx = await requireWorkspace();
  const { connected, error } = await searchParams;
  const accounts = await db.socialAccount.findMany({
    where: { workspaceId: ctx.active.workspace.id },
    include: { channels: true },
    orderBy: { connectedAt: "desc" },
  });
  const canConnect = can(ctx.active.role, "channels.connect");
  const providers = socialProviders as Record<string, boolean>;

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Connect social accounts and third-party tools. All connections are scoped to this workspace."
        actions={canConnect && <ConnectAccount providers={providers} />}
      />

      {connected && (
        <p className="mb-4 rounded-[var(--radius-md)] border border-[var(--success)] bg-[var(--success-soft)] px-3 py-2 text-[13px] text-[var(--success)]">
          {connected} connected.
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-[var(--radius-md)] border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-[13px] text-[var(--danger)]">
          Connect failed: {error}
        </p>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-[14px] font-semibold text-[var(--text)]">Social accounts</h2>
        {accounts.length === 0 ? (
          <EmptyState
            title="No accounts connected"
            description="Connect a social account to start scheduling and publishing."
            action={canConnect && <ConnectAccount providers={providers} />}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((a) => (
              <Card key={a.id}>
                <CardContent className="pt-5">
                  <div className="flex items-center gap-2.5">
                    <PlatformBadge platform={a.platform} size={28} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-[var(--text)]">{a.displayName}</p>
                      <p className="truncate text-[13px] text-[var(--text-subtle)]">{a.handle}</p>
                    </div>
                    <Badge tone={a.status === "connected" ? "success" : a.status === "expired" ? "warning" : "danger"} dot>
                      {a.status}
                    </Badge>
                  </div>
                  <p className="mt-2 text-[12px] text-[var(--text-subtle)]">
                    {a.channels.length} channel{a.channels.length === 1 ? "" : "s"} ·{" "}
                    {a.lastSyncedAt ? `synced ${relativeTime(a.lastSyncedAt)}` : "never synced"}
                  </p>
                  {canConnect && (
                    <div className="mt-3">
                      <AccountActions id={a.id} status={a.status} />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-[14px] font-semibold text-[var(--text)]">Apps & tools</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CATALOG.map((c) => (
            <div key={c.name} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="flex items-center justify-between">
                <p className="text-[15px] font-semibold text-[var(--text)]">{c.name}</p>
                <Badge tone="neutral">{c.cat}</Badge>
              </div>
              <p className="mt-1 text-[13px] text-[var(--text-muted)]">{c.desc}</p>
              {c.href ? (
                <Link href={c.href} className="mt-3 inline-block text-[13px] font-medium text-[var(--primary)] hover:underline">
                  Configure →
                </Link>
              ) : (
                <p className="mt-3 text-[13px] text-[var(--text-subtle)]">Available on Team &amp; Agency plans</p>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="mt-8 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="text-[14px] font-semibold text-[var(--text)]">Building your own integration?</p>
        <p className="mt-1 text-[13px] text-[var(--text-muted)]">
          Use API keys and webhooks to connect Cadence to anything.
        </p>
        <Link href="/settings/api" className="mt-2 inline-block text-[13px] font-medium text-[var(--primary)] hover:underline">
          Open developer settings →
        </Link>
      </div>
    </>
  );
}
