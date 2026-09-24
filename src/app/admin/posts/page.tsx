import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Stat } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";
import { parseAdminQuery } from "@/lib/admin-query";
import { AdminToolbar, Pagination, SortHeader } from "../_controls";
import { PostModerateActions } from "../_more-client";
import { PostInspectorButton } from "./post-inspector";

export const metadata: Metadata = { title: "Admin · Posts" };

const STATUSES = ["draft", "awaiting_approval", "approved", "scheduled", "publishing", "published", "failed", "archived"];

function tone(status: string) {
  if (status === "published") return "success" as const;
  if (status === "failed") return "danger" as const;
  if (status === "archived") return "neutral" as const;
  return "warning" as const;
}

export default async function AdminPostsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const query = parseAdminQuery(raw, {
    defaultSort: "createdAt",
    sortable: ["createdAt", "scheduledAt", "publishedAt"],
    filterKeys: ["status", "platform"],
  });

  const where: Prisma.PostWhereInput = {};
  if (query.q) {
    where.OR = [
      { title: { contains: query.q, mode: "insensitive" } },
      { author: { email: { contains: query.q, mode: "insensitive" } } },
      { workspace: { org: { name: { contains: query.q, mode: "insensitive" } } } },
    ];
  }
  if (query.filters.status) where.status = query.filters.status;
  if (query.filters.platform) where.channels = { some: { platform: query.filters.platform } };

  const [posts, total, byStatus] = await Promise.all([
    db.post.findMany({
      where,
      orderBy: { [query.sort]: query.dir },
      skip: query.skip,
      take: query.perPage,
      include: {
        author: { select: { id: true, name: true, email: true } },
        workspace: { select: { id: true, name: true, org: { select: { id: true, name: true, slug: true } } } },
        channels: { select: { platform: true, body: true, status: true, error: true, publishedUrl: true } },
        media: { include: { media: { select: { url: true, mimeType: true, filename: true } } } },
        _count: { select: { channels: true } },
      },
    }),
    db.post.count({ where }),
    db.post.groupBy({ by: ["status"], _count: true }),
  ]);
  const counts = Object.fromEntries(byStatus.map((s) => [s.status, s._count]));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Posts</h1>
        <p className="mt-1 text-[14px] text-[var(--text-muted)]">Every post across all workspaces. Take down anything that violates policy.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total" value={total} />
        <Stat label="Published" value={counts.published ?? 0} />
        <Stat label="Scheduled" value={counts.scheduled ?? 0} />
        <Stat label="Failed" value={counts.failed ?? 0} />
        <Stat label="Awaiting approval" value={counts.awaiting_approval ?? 0} />
        <Stat label="Archived" value={counts.archived ?? 0} />
      </div>

      <AdminToolbar
        searchPlaceholder="Search title, author email, org…"
        filters={[
          { key: "status", label: "Status", options: STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") })) },
          {
            key: "platform",
            label: "Platform",
            options: ["instagram", "facebook", "linkedin", "x", "tiktok", "youtube", "pinterest", "threads", "bluesky"].map((p) => ({ value: p, label: p })),
          },
        ]}
      />

      <Table>
        <THead>
          <TR>
            <TH>Post Snippet</TH>
            <TH>Author</TH>
            <TH>Org / Workspace</TH>
            <TH>Channels</TH>
            <TH>Status</TH>
            <TH><SortHeader field="scheduledAt" label="Scheduled" /></TH>
            <TH><SortHeader field="createdAt" label="Created" /></TH>
            <TH>Moderation</TH>
          </TR>
        </THead>
        <tbody>
          {posts.map((p) => {
            const firstSnippet = p.title || p.channels[0]?.body || "Untitled post";
            const inspectorData = {
              id: p.id,
              title: p.title,
              status: p.status,
              scheduledAt: p.scheduledAt ? p.scheduledAt.toISOString() : null,
              publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
              createdAt: p.createdAt.toISOString(),
              author: { name: p.author.name, email: p.author.email },
              workspace: {
                name: p.workspace.name,
                org: { name: p.workspace.org.name, slug: p.workspace.org.slug },
              },
              channels: p.channels.map((c) => ({
                platform: c.platform,
                body: c.body,
                status: c.status,
                error: c.error,
                publishedUrl: c.publishedUrl,
              })),
              media: p.media.map((m) => ({
                url: m.media.url,
                mimeType: m.media.mimeType,
                filename: m.media.filename,
              })),
            };

            return (
              <TR key={p.id}>
                <TD className="max-w-[240px]">
                  <p className="truncate font-medium text-[var(--text)]">
                    {firstSnippet}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="font-mono text-[11px] text-[var(--text-subtle)] truncate max-w-[120px]">
                      {p.id}
                    </span>
                    {p.media.length > 0 && (
                      <span className="rounded bg-[var(--surface-subtle)] px-1 py-0.2 text-[10px] font-medium text-[var(--text-subtle)] border border-[var(--border)]">
                        {p.media.length} media
                      </span>
                    )}
                  </div>
                </TD>
                <TD>
                  <Link href={`/admin/users/${p.author.id}`} className="font-medium text-[var(--text)] hover:underline">
                    {p.author.name}
                  </Link>
                  <p className="text-[12px] text-[var(--text-subtle)]">{p.author.email}</p>
                </TD>
                <TD className="text-[var(--text-muted)]">
                  <Link href={`/admin/orgs/${p.workspace.org.id}`} className="hover:underline">
                    {p.workspace.org.name}
                  </Link>
                  <span className="text-[12px] text-[var(--text-subtle)]"> / {p.workspace.name}</span>
                </TD>
                <TD>
                  <div className="flex flex-wrap gap-1 max-w-[130px]">
                    {p.channels.map((c, i) => (
                      <Badge key={i} tone="neutral" className="text-[10px] capitalize">
                        {c.platform}
                      </Badge>
                    ))}
                    {p.channels.length === 0 && <span className="text-xs text-[var(--text-subtle)]">—</span>}
                  </div>
                </TD>
                <TD><Badge tone={tone(p.status)}>{p.status.replace(/_/g, " ")}</Badge></TD>
                <TD className="text-[var(--text-subtle)]">{p.scheduledAt ? formatDate(p.scheduledAt) : "—"}</TD>
                <TD className="text-[var(--text-subtle)]">{formatDate(p.createdAt)}</TD>
                <TD>
                  <div className="flex items-center gap-1">
                    <PostInspectorButton post={inspectorData} />
                    <PostModerateActions id={p.id} archived={p.status === "archived"} />
                  </div>
                </TD>
              </TR>
            );
          })}
          {posts.length === 0 && (
            <TR><TD colSpan={8} className="py-8 text-center text-[var(--text-subtle)]">No posts match.</TD></TR>
          )}
        </tbody>
      </Table>

      <Pagination page={query.page} perPage={query.perPage} total={total} />
    </div>
  );
}
