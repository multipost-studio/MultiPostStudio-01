import type { Metadata } from "next";
import { db } from "@/lib/db";
import { BlogSubNav } from "../_components/blog-sub-nav";
import { TagsClient } from "./tags-client";

export const metadata: Metadata = { title: "Admin · Blog Tags" };

export default async function AdminBlogTagsPage() {
  const tags = await db.blogTag.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { posts: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text)]">Blog Tags</h1>
          <p className="mt-1 text-[14px] text-[var(--text-muted)]">
            Manage granular keywords, topics, and cross-cutting themes across your content library.
          </p>
        </div>
      </div>

      <BlogSubNav />

      <TagsClient initialTags={tags} />
    </div>
  );
}
