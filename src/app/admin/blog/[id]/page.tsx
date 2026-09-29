import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { BlogSubNav } from "../_components/blog-sub-nav";
import { BlogEditorClient } from "../blog-editor-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const post = await db.blogPost.findUnique({ where: { id }, select: { title: true } });
  return { title: post ? `Edit: ${post.title} · Blog CMS` : "Edit Post · Blog CMS" };
}

export default async function EditBlogPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [post, categories, authors, availableTags] = await Promise.all([
    db.blogPost.findUnique({
      where: { id },
      include: {
        author: true,
        category: true,
        tags: { include: { tag: { select: { id: true, name: true } } } },
        revisions: {
          orderBy: { createdAt: "desc" },
          take: 30,
        },
      },
    }),
    db.blogCategory.findMany({ select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } }),
    db.blogAuthor.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.blogTag.findMany({ select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } }),
  ]);

  if (!post) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <BlogSubNav />
      <BlogEditorClient
        initialPost={post}
        categories={categories}
        authors={authors}
        availableTags={availableTags}
      />
    </div>
  );
}
