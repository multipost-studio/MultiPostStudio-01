import type { Metadata } from "next";
import { db } from "@/lib/db";
import { BlogSubNav } from "../_components/blog-sub-nav";
import { getBlogTimeSeriesAnalytics, getBlogDashboardMetrics } from "@/lib/blog";
import { BlogAnalyticsClient } from "./analytics-client";

export const metadata: Metadata = { title: "Admin · Blog Analytics" };
export const dynamic = "force-dynamic";

export default async function AdminBlogAnalyticsPage() {
  let metrics: any = { totalViews: 0, totalPosts: 0, totalShares: 0, avgReadMins: 0, publishedThisMonth: 0 };
  let timeSeries: any[] = [];
  let topPosts: any[] = [];
  let categories: any[] = [];

  try {
    const res = await Promise.all([
      getBlogDashboardMetrics(),
      getBlogTimeSeriesAnalytics(30),
      db.blogPost.findMany({
        where: { deletedAt: null },
        orderBy: { views: "desc" },
        take: 10,
        select: {
          id: true,
          title: true,
          slug: true,
          views: true,
          shares: true,
          readMins: true,
          status: true,
          publishedAt: true,
          author: { select: { name: true } },
          category: { select: { name: true } },
        },
      }),
      db.blogCategory.findMany({
        include: {
          _count: { select: { posts: { where: { deletedAt: null } } } },
        },
      }),
    ]);
    metrics = res[0];
    timeSeries = res[1];
    topPosts = res[2];
    categories = res[3];
  } catch (err) {
    console.error("Failed to load blog analytics:", err);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text)]">Blog Analytics & Performance</h1>
          <p className="mt-1 text-[14px] text-[var(--text-muted)]">
            Article readership metrics, engagement rates, social shares, and category growth.
          </p>
        </div>
      </div>

      <BlogSubNav />

      <BlogAnalyticsClient
        metrics={metrics}
        timeSeries={timeSeries}
        topPosts={topPosts}
        categories={categories}
      />
    </div>
  );
}
