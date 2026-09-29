import type { Metadata } from "next";
import { db } from "@/lib/db";
import { BlogSubNav } from "../_components/blog-sub-nav";
import { BlogCalendarClient } from "./calendar-client";

export const metadata: Metadata = { title: "Admin · Content Calendar" };

export default async function AdminBlogCalendarPage() {
  const posts = await db.blogPost.findMany({
    where: {
      deletedAt: null,
      OR: [
        { publishedAt: { not: null } },
        { scheduledAt: { not: null } },
      ],
    },
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      publishedAt: true,
      scheduledAt: true,
      author: { select: { name: true } },
      category: { select: { name: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text)]">Editorial Content Calendar</h1>
          <p className="mt-1 text-[14px] text-[var(--text-muted)]">
            Schedule publishing cadences and visualize past and upcoming articles.
          </p>
        </div>
      </div>

      <BlogSubNav />

      <BlogCalendarClient initialPosts={posts} />
    </div>
  );
}
