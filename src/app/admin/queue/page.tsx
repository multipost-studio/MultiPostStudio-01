import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { formatDate, relativeTime } from "@/lib/utils";
import { parseAdminQuery } from "@/lib/admin-query";
import { Stat } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { AdminToolbar, Pagination, SortHeader } from "../_controls";
import { QueueHeaderActions, QueueJobRowActions } from "./queue-client";

export const metadata: Metadata = { title: "Admin · Worker Queue Engine" };

const STATUSES = ["queued", "running", "failed", "done", "canceled"];

function jobTone(status: string) {
  if (status === "done") return "success" as const;
  if (status === "failed") return "danger" as const;
  if (status === "running") return "info" as const;
  if (status === "queued") return "warning" as const;
  return "neutral" as const;
}

export default async function AdminQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const query = parseAdminQuery(raw, {
    defaultSort: "runAt",
    sortable: ["runAt", "createdAt", "attempts", "status"],
    filterKeys: ["status"],
  });

  const where: Prisma.PublishJobWhereInput = {};
  if (query.q) {
    where.OR = [
      { id: { contains: query.q } },
      { postId: { contains: query.q } },
      { lastError: { contains: query.q, mode: "insensitive" } },
      { post: { title: { contains: query.q, mode: "insensitive" } } },
      { post: { workspace: { name: { contains: query.q, mode: "insensitive" } } } },
    ];
  }
  if (query.filters.status) where.status = query.filters.status;

  const [
    totalCount,
    queuedCount,
    runningCount,
    failedCount,
    doneCount,
    jobs,
    filteredTotal,
  ] = await Promise.all([
    db.publishJob.count(),
    db.publishJob.count({ where: { status: "queued" } }),
    db.publishJob.count({ where: { status: "running" } }),
    db.publishJob.count({ where: { status: "failed" } }),
    db.publishJob.count({ where: { status: "done" } }),
    db.publishJob.findMany({
      where,
      orderBy: { [query.sort]: query.dir },
      skip: query.skip,
      take: query.perPage,
      include: {
        post: {
          select: {
            id: true,
            title: true,
            author: { select: { id: true, name: true, email: true } },
            workspace: {
              select: {
                id: true,
                name: true,
                org: { select: { id: true, name: true } },
              },
            },
            channels: { select: { platform: true, status: true, error: true } },
          },
        },
      },
    }),
    db.publishJob.count({ where }),
  ]);

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text)]">Worker Queue Engine</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Live database-backed background publish jobs, lease heartbeats, and worker dispatcher.
          </p>
        </div>
        <QueueHeaderActions hasFailedJobs={failedCount > 0} />
      </div>

      {/* Metrics Row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Total Jobs" value={totalCount} />
        <Stat label="Queued / Pending" value={queuedCount} />
        <Stat label="Active Running" value={runningCount} />
        <Stat label="Failed Jobs" value={failedCount} />
        <Stat label="Completed (Done)" value={doneCount} />
      </div>

      {/* Controls Toolbar */}
      <AdminToolbar
        searchPlaceholder="Search job ID, post ID, workspace, error…"
        filters={[
          {
            key: "status",
            label: "Status",
            options: STATUSES.map((s) => ({ value: s, label: s })),
          },
        ]}
      />

      {/* Jobs Table */}
      <Table>
        <THead>
          <TR>
            <TH>Job / Target Post</TH>
            <TH>Org / Workspace</TH>
            <TH><SortHeader field="status" label="Status" /></TH>
            <TH><SortHeader field="attempts" label="Attempts" /></TH>
            <TH><SortHeader field="runAt" label="Scheduled For" /></TH>
            <TH>Lease / Started</TH>
            <TH>Error Details</TH>
            <TH>Actions</TH>
          </TR>
        </THead>
        <tbody>
          {jobs.map((job) => {
            const post = job.post;
            return (
              <TR key={job.id}>
                <TD className="max-w-[220px]">
                  <p className="font-mono text-xs font-semibold text-[var(--text)] truncate">{job.id}</p>
                  {post ? (
                    <div className="mt-0.5">
                      <p className="text-xs text-[var(--text)] truncate">
                        {post.title || "Untitled Post"}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {post.channels.map((c, i) => (
                          <Badge key={i} tone="neutral" className="text-[10px] capitalize">
                            {c.platform}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-[var(--text-subtle)]">Post deleted</span>
                  )}
                </TD>

                <TD>
                  {post ? (
                    <div>
                      <Link href={`/admin/orgs/${post.workspace.org.id}`} className="font-medium text-xs text-[var(--text)] hover:underline">
                        {post.workspace.org.name}
                      </Link>
                      <p className="text-[11px] text-[var(--text-subtle)]">{post.workspace.name}</p>
                    </div>
                  ) : (
                    <span className="text-xs text-[var(--text-subtle)]">—</span>
                  )}
                </TD>

                <TD>
                  <Badge tone={jobTone(job.status)} className="capitalize">
                    {job.status}
                  </Badge>
                </TD>

                <TD className="tabular-nums text-xs">
                  {job.attempts} / 5
                </TD>

                <TD className="text-xs text-[var(--text-subtle)] whitespace-nowrap">
                  {formatDate(job.runAt)}
                  <p className="text-[11px]">{relativeTime(job.runAt)}</p>
                </TD>

                <TD className="text-xs text-[var(--text-subtle)]">
                  {job.leaseUntil ? (
                    <div>
                      <span className="font-mono text-[11px]">Lease active</span>
                      <p className="text-[11px]">{relativeTime(job.leaseUntil)}</p>
                    </div>
                  ) : job.startedAt ? (
                    <span>Started {relativeTime(job.startedAt)}</span>
                  ) : (
                    <span>—</span>
                  )}
                </TD>

                <TD className="max-w-[260px]">
                  {job.lastError ? (
                    <p className="font-mono text-[11px] text-[var(--danger)] line-clamp-2" title={job.lastError}>
                      {job.lastError}
                    </p>
                  ) : (
                    <span className="text-xs text-[var(--text-subtle)]">None</span>
                  )}
                </TD>

                <TD>
                  <QueueJobRowActions jobId={job.id} status={job.status} />
                </TD>
              </TR>
            );
          })}
          {jobs.length === 0 && (
            <TR>
              <TD colSpan={8} className="py-8 text-center text-sm text-[var(--text-subtle)]">
                No worker jobs match the filter criteria.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>

      <Pagination page={query.page} perPage={query.perPage} total={filteredTotal} />
    </div>
  );
}
