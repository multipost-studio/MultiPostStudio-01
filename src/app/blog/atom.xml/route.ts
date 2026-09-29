import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const baseUrl = appUrl().replace(/\/$/, "");

  const [settingsRaw, posts] = await Promise.all([
    db.blogSetting.findMany({
      where: { key: { in: ["blog_title", "blog_description", "rss_enabled"] } },
    }),
    db.blogPost.findMany({
      where: { status: "published", deletedAt: null },
      include: { author: true, category: true },
      orderBy: { publishedAt: "desc" },
      take: 50,
    }),
  ]);

  const settings: Record<string, string> = {};
  for (const s of settingsRaw) settings[s.key] = s.value;

  if (settings.rss_enabled === "false") {
    return new NextResponse("Atom feeds are disabled.", { status: 404 });
  }

  const title = settings.blog_title || "MultiPost Studio Blog";
  const subtitle =
    settings.blog_description ||
    "Insights, product updates, and growth strategies for modern marketing teams.";

  const entriesXml = posts
    .map((p) => {
      const updated = p.updatedAt ? new Date(p.updatedAt).toISOString() : new Date().toISOString();
      const link = `${baseUrl}/blog/${p.slug}`;
      const author = p.author?.name || "MultiPost Studio Team";
      const cleanExcerpt = (p.excerpt || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const cleanTitle = (p.title || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      return `  <entry>
    <title>${cleanTitle}</title>
    <link href="${link}" rel="alternate"/>
    <id>${link}</id>
    <updated>${updated}</updated>
    <summary>${cleanExcerpt}</summary>
    <author>
      <name>${author}</name>
    </author>
    ${p.category ? `<category term="${p.category.name}"/>` : ""}
  </entry>`;
    })
    .join("\n");

  const atomXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${title}</title>
  <subtitle>${subtitle}</subtitle>
  <link href="${baseUrl}/blog/atom.xml" rel="self"/>
  <link href="${baseUrl}/blog"/>
  <id>${baseUrl}/blog</id>
  <updated>${new Date().toISOString()}</updated>
${entriesXml}
</feed>`;

  return new NextResponse(atomXml, {
    headers: {
      "Content-Type": "application/atom+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
