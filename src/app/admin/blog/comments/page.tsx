import type { Metadata } from "next";
import { db } from "@/lib/db";
import { BlogSubNav } from "../_components/blog-sub-nav";
import { CommentsClient } from "./comments-client";

export const metadata: Metadata = { title: "Admin · Blog Comments" };

export default async function AdminBlogCommentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status || "pending";

  const where: Record<string, unknown> = {};
  if (status !== "all") {
    where.status = status;
  }

  const [comments, pendingCount, approvedCount, spamCount, rejectedCount] = await Promise.all([
    db.blogComment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        post: { select: { id: true, title: true, slug: true } },
      },
    }),
    db.blogComment.count({ where: { status: "pending" } }),
    db.blogComment.count({ where: { status: "approved" } }),
    db.blogComment.count({ where: { status: "spam" } }),
    db.blogComment.count({ where: { status: "rejected" } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text)]">Blog Comments & Moderation</h1>
          <p className="mt-1 text-[14px] text-[var(--text-muted)]">
            Review reader feedback, approve comments, manage spam filters, and moderate community discussions.
          </p>
        </div>
      </div>

      <BlogSubNav />

      <CommentsClient
        initialComments={comments}
        counts={{
          pending: pendingCount,
          approved: approvedCount,
          spam: spamCount,
          rejected: rejectedCount,
        }}
        currentStatus={status}
      />
    </div>
  );
}
