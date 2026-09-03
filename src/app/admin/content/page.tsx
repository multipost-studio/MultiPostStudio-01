import type { Metadata } from "next";
import { db } from "@/lib/db";
import { CMS_COLLECTIONS } from "@/lib/cms";
import { ContentManager } from "../content-client";

export const metadata: Metadata = { title: "Admin · Content" };

const SHAPES: Record<string, string> = {
  blog: `{ "slug", "title", "excerpt", "date": "YYYY-MM-DD", "author", "readMins", "tag", "body": ["para", "..."] }`,
  changelog: `{ "date": "YYYY-MM-DD", "version", "items": [{ "type": "new|improved|fixed", "text" }] }`,
  customer: `{ "slug", "name", "industry", "quote", "person", "result" }`,
  faq: `{ "page": "help|pricing|contact|...", "q", "a" }`,
};

export default async function AdminContentPage() {
  const entries = await db.cmsEntry.findMany({ orderBy: [{ collection: "asc" }, { sortIndex: "asc" }] });
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Content (CMS)</h1>
        <p className="mt-1 text-[14px] text-[var(--text-muted)]">
          Edits publish immediately to the marketing site. Collections with no rows fall back to the built-in seed
          content until you add one. Run <code>npm run db:seed</code> once to import editable copies.
        </p>
      </div>
      <ContentManager
        collections={[...CMS_COLLECTIONS]}
        shapes={SHAPES}
        entries={entries.map((e) => ({
          id: e.id,
          collection: e.collection,
          slug: e.slug,
          data: e.data,
          published: e.published,
          sortIndex: e.sortIndex,
        }))}
      />
    </div>
  );
}
