import type { Metadata } from "next";
import { db } from "@/lib/db";
import { BlogSubNav } from "../_components/blog-sub-nav";
import { AuthorsClient } from "./authors-client";

export const metadata: Metadata = { title: "Admin · Blog Authors" };
export const dynamic = "force-dynamic";

export default async function AdminBlogAuthorsPage() {
  let authors: any[] = [];
  try {
    authors = await db.blogAuthor.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { posts: { where: { deletedAt: null } } } },
      },
    });
  } catch (err) {
    console.error("Failed to load blog authors:", err);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text)]">Blog Authors</h1>
          <p className="mt-1 text-[14px] text-[var(--text-muted)]">
            Manage writer profiles, bios, social links, and bylines displayed on public articles.
          </p>
        </div>
      </div>

      <BlogSubNav />

      <AuthorsClient initialAuthors={authors} />
    </div>
  );
}
