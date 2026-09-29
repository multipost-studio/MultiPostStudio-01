import type { Metadata } from "next";
import { db } from "@/lib/db";
import { BlogSubNav } from "../_components/blog-sub-nav";
import { MediaClient } from "./media-client";

export const metadata: Metadata = { title: "Admin · Blog Media" };

export default async function AdminBlogMediaPage() {
  // Query media assets uploaded for the platform/blog
  const assets = await db.mediaAsset.findMany({
    where: { kind: "image" },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: {
      id: true,
      url: true,
      filename: true,
      sizeBytes: true,
      width: true,
      height: true,
      mimeType: true,
      createdAt: true,
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text)]">Blog Media Library</h1>
          <p className="mt-1 text-[14px] text-[var(--text-muted)]">
            Upload and organize featured images, article headers, and visual assets.
          </p>
        </div>
      </div>

      <BlogSubNav />

      <MediaClient initialAssets={assets} />
    </div>
  );
}
