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
    return new NextResponse("RSS feeds are disabled.", { status: 404 });
  }

  const title = settings.blog_title || "MultiPost Studio Blog";
  const description =
    settings.blog_description ||
    "Insights, product updates, and growth strategies for modern marketing teams.";

  const itemsXml = posts
    .map((p) => {
      const pubDate = p.publishedAt ? new Date(p.publishedAt).toUTCString() : new Date().toUTCString();
      const link = `${baseUrl}/blog/${p.slug}`;
      const author = p.author?.name || "MultiPost Studio Team";
      const cleanExcerpt = (p.excerpt || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
      const cleanTitle = (p.title || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      return `    <item>
      <title>${cleanTitle}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${cleanExcerpt}</description>
      <author>${author}</author>
      ${p.category ? `<category>${p.category.name}</category>` : ""}
    </item>`;
    })
    .join("\n");

  const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${title}</title>
    <link>${baseUrl}/blog</link>
    <description>${description}</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${baseUrl}/blog/feed.xml" rel="self" type="application/rss+xml"/>
${itemsXml}
  </channel>
</rss>`;

  return new NextResponse(rssXml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
