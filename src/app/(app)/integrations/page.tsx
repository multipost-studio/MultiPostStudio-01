import type { Metadata } from "next";
import Link from "next/link";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { socialProviders, flags } from "@/lib/env";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { connectionStatus, oauthErrorMessage } from "./connection-status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { PlatformBadge } from "@/components/brand";
import { relativeTime } from "@/lib/utils";
import { ConnectAccount, AccountActions, IntegrationCard } from "./integrations-client";

export const metadata: Metadata = { title: "Integrations" };

const CATALOG = [
  { name: "Zapier", desc: "5,000+ app automations via webhooks", cat: "Automation", href: "/settings/api" },
  { name: "Make", desc: "Visual automation scenarios", cat: "Automation", href: "/settings/api" },
  { name: "Slack", desc: "Approval and publish notifications in Slack", cat: "Comms" },
  { name: "Webhooks", desc: "Send events to any endpoint", cat: "Developer", href: "/settings/api" },
];

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string; detail?: string; gbp_select?: string }>;
}) {
  const ctx = await requireWorkspace();
  const { connected, error, detail, gbp_select } = await searchParams;
  const accounts = await db.socialAccount.findMany({
    where: { workspaceId: ctx.active.workspace.id },
    // Explicit select — never pull accessToken/refreshToken/metadata into a
    // page-data object that could later be passed to a Client Component.
    select: {
      id: true,
      platform: true,
      displayName: true,
      handle: true,
      status: true,
      lastSyncedAt: true,
      channels: { select: { id: true } },
    },
    orderBy: { connectedAt: "desc" },
  });
  const canConnect = can(ctx.active.role, "channels.connect");
  const providers = socialProviders as Record<string, boolean>;
  const canManageApps = can(ctx.active.role, "integrations.manage");

  const [drive, googlePhotos, dropbox, onedrive, canva] = await Promise.all([
    db.connectedIntegration.findUnique({
      where: { workspaceId_provider: { workspaceId: ctx.active.workspace.id, provider: "google_drive" } },
      select: { id: true, accountEmail: true, status: true, scopes: true },
    }),
    db.connectedIntegration.findUnique({
      where: { workspaceId_provider: { workspaceId: ctx.active.workspace.id, provider: "google_photos" } },
      select: { id: true, accountEmail: true, status: true },
    }),
    db.connectedIntegration.findUnique({
      where: { workspaceId_provider: { workspaceId: ctx.active.workspace.id, provider: "dropbox" } },
      select: { id: true, accountEmail: true, status: true },
    }),
    db.connectedIntegration.findUnique({
      where: { workspaceId_provider: { workspaceId: ctx.active.workspace.id, provider: "onedrive" } },
      select: { id: true, accountEmail: true, status: true },
    }),
    db.connectedIntegration.findUnique({
      where: { workspaceId_provider: { workspaceId: ctx.active.workspace.id, provider: "canva" } },
      select: { id: true, accountEmail: true, status: true },
    }),
  ]);
  const driveNeedsReconnect = !!(drive && drive.status === "connected" && !drive.scopes?.includes("drive.file"));

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Connect social accounts and third-party tools. All connections are scoped to this workspace."
        tourId="integrations"
        wash="c"
        actions={canConnect && <ConnectAccount providers={providers} />}
      />

      {connected && (
        <Alert variant="success" className="mb-4 flex items-center gap-3">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <AlertDescription className="font-medium">{connected} connected.</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <div>
            <AlertTitle>Couldn&apos;t connect that account</AlertTitle>
            <AlertDescription className="mt-0.5">{oauthErrorMessage(error, detail)}</AlertDescription>
          </div>
        </Alert>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-[14px] font-semibold text-[var(--text)]">Social accounts</h2>
        {accounts.length === 0 ? (
          <EmptyState
            title="No social accounts connected"
            description="Connect your social profiles (Instagram, Facebook, LinkedIn, X, TikTok, YouTube, Pinterest, Threads, or Bluesky) to enable multi-channel publishing, unified community triage, and performance analytics."
            action={canConnect && <ConnectAccount providers={providers} />}
            mascot
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
                    <Badge tone={connectionStatus(a.status).tone} dot>
                      {connectionStatus(a.status).label}
                    </Badge>
                  </div>
                  <p className="mt-2 text-[12px] text-[var(--text-subtle)]" suppressHydrationWarning>
                    {a.platform === "gbp"
                      ? a.channels.length > 0
                        ? `${a.channels.length} location${a.channels.length === 1 ? "" : "s"} connected`
                        : "No locations selected"
                      : `${a.channels.length} channel${a.channels.length === 1 ? "" : "s"}`}{" "}
                    · {a.lastSyncedAt ? `synced ${relativeTime(a.lastSyncedAt)}` : "never synced"}
                  </p>
                  {connectionStatus(a.status).detail && (
                    <p className="mt-2 text-[12px] leading-relaxed text-[var(--text-muted)]">
                      {connectionStatus(a.status).detail}
                    </p>
                  )}
                  {canConnect && (
                    <div className="mt-3">
                      <AccountActions
                        id={a.id}
                        status={a.status}
                        platform={a.platform}
                        autoOpenLocations={gbp_select === a.id}
                      />
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
          {flags.googleDrive && canManageApps && (
            <IntegrationCard
              provider="google_drive"
              label="Google Drive"
              desc="Attach assets straight from Drive"
              cat="Storage"
              connected={drive && drive.status === "connected" ? { id: drive.id, accountEmail: drive.accountEmail } : null}
              connectedAs={drive?.accountEmail ?? null}
              needsReconnect={driveNeedsReconnect}
            />
          )}
          {flags.googlePhotos && canManageApps && (
            <IntegrationCard
              provider="google_photos"
              label="Google Photos"
              desc="Pull pictures and videos straight into the composer"
              cat="Storage"
              connected={googlePhotos && googlePhotos.status === "connected" ? { id: googlePhotos.id, accountEmail: googlePhotos.accountEmail } : null}
              connectedAs={googlePhotos?.accountEmail ?? null}
            />
          )}
          {flags.dropbox && canManageApps && (
            <IntegrationCard
              provider="dropbox"
              label="Dropbox"
              desc="Import media from Dropbox folders"
              cat="Storage"
              connected={dropbox && dropbox.status === "connected" ? { id: dropbox.id, accountEmail: dropbox.accountEmail } : null}
              connectedAs={dropbox?.accountEmail ?? null}
            />
          )}
          {flags.onedrive && canManageApps && (
            <IntegrationCard
              provider="onedrive"
              label="OneDrive"
              desc="Pull files from OneDrive"
              cat="Storage"
              connected={onedrive && onedrive.status === "connected" ? { id: onedrive.id, accountEmail: onedrive.accountEmail } : null}
              connectedAs={onedrive?.accountEmail ?? null}
            />
          )}
          {flags.canva && canManageApps && (
            <IntegrationCard
              provider="canva"
              label="Canva"
              desc="Design and send to the composer"
              cat="Design"
              connected={canva && canva.status === "connected" ? { id: canva.id, accountEmail: canva.accountEmail } : null}
              connectedAs={canva?.accountEmail ?? null}
            />
          )}
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
          Use API keys and webhooks to connect MultiPost Studio to anything.
        </p>
        <Link href="/settings/api" className="mt-2 inline-block text-[13px] font-medium text-[var(--primary)] hover:underline">
          Open developer settings →
        </Link>
      </div>
    </>
  );
}
