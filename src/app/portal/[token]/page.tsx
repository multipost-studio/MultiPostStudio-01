import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Logo } from "@/components/brand";
import { InlineEmpty } from "@/components/ui/misc";
import { PortalRequestCard } from "./portal-client";

/**
 * Public client review portal — a magic link, no Cadence account required.
 *
 * Authorization is the token itself (see actions/portal.ts), exactly like
 * the existing /share/report/[token] pattern: the workspace is resolved
 * FROM the token, never from the URL, and an unknown/expired/revoked token
 * renders identically to a 404 so a probe learns nothing.
 *
 * Scope is deliberately narrow — only approval requests whose current stage
 * is gated to the "client" role are shown or actionable here.
 */
async function loadLink(token: string) {
  if (!/^port_[a-f0-9]{20,64}$/.test(token)) return null;
  const link = await db.portalLink.findUnique({
    where: { token },
    select: { id: true, label: true, expiresAt: true, revokedAt: true, workspace: { select: { id: true, name: true } } },
  });
  if (!link || link.revokedAt || (link.expiresAt && link.expiresAt.getTime() < Date.now())) return null;
  return link;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const link = await loadLink(token);
  return {
    title: link ? `Review — ${link.workspace.name}` : "Client review",
    robots: { index: false, follow: false },
  };
}

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await loadLink(token);
  if (!link) notFound();

  const requests = await db.approvalRequest.findMany({
    where: { post: { workspaceId: link.workspace.id }, status: { in: ["in_review", "changes_requested"] } },
    orderBy: { createdAt: "asc" },
    include: {
      post: {
        include: {
          channels: true,
          media: { include: { media: true }, orderBy: { order: "asc" } },
        },
      },
      flow: { include: { stages: { orderBy: { order: "asc" } } } },
    },
  });
  // Only what this link can actually act on — see module doc.
  const forClient = requests.filter((r) => r.flow.stages[r.currentStage]?.roleGate === "client");

  return (
    <main className="min-h-screen bg-[var(--bg)] px-5 py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] pb-6">
          <div className="min-w-0">
            <h1 className="text-[24px] font-bold leading-tight text-[var(--text)]">Content review</h1>
            <p className="mt-1 text-[14px] text-[var(--text-muted)]">
              {link.workspace.name} · reviewing as {link.label}
            </p>
          </div>
          <Logo />
        </header>

        {forClient.length === 0 ? (
          <InlineEmpty title="Nothing waiting on your review" hint="New posts will show up here as soon as they're ready for you." />
        ) : (
          <div className="space-y-4">
            {forClient.map((r) => (
              <PortalRequestCard
                key={r.id}
                token={token}
                requestId={r.id}
                title={r.post.title ?? "Untitled post"}
                status={r.status}
                bodies={r.post.channels.map((c) => ({
                  platform: c.platform,
                  body: c.body,
                  mediaUrls: r.post.media.map((m) => m.media.url),
                }))}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
