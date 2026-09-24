import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/env";
import {
  BLOG_POSTS,
  CUSTOMERS,
  FEATURE_PAGES,
  GUIDES,
  JOBS,
  SOLUTION_PAGES,
} from "@/app/(marketing)/_data";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = appUrl().replace(/\/$/, "");
  const now = new Date();

  const coreRoutes: Array<{ path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" }> = [
    { path: "", priority: 1.0, changeFrequency: "daily" },
    { path: "/pricing", priority: 0.9, changeFrequency: "daily" },
    { path: "/features", priority: 0.9, changeFrequency: "weekly" },
    { path: "/solutions", priority: 0.8, changeFrequency: "weekly" },
    { path: "/blog", priority: 0.8, changeFrequency: "daily" },
    { path: "/changelog", priority: 0.7, changeFrequency: "weekly" },
    { path: "/about", priority: 0.6, changeFrequency: "monthly" },
    { path: "/contact", priority: 0.6, changeFrequency: "monthly" },
    { path: "/security", priority: 0.7, changeFrequency: "monthly" },
    { path: "/customers", priority: 0.7, changeFrequency: "weekly" },
    { path: "/guides", priority: 0.7, changeFrequency: "weekly" },
    { path: "/careers", priority: 0.6, changeFrequency: "weekly" },
    { path: "/help", priority: 0.6, changeFrequency: "monthly" },
    { path: "/roadmap", priority: 0.6, changeFrequency: "weekly" },
    { path: "/status", priority: 0.5, changeFrequency: "daily" },
    { path: "/community", priority: 0.6, changeFrequency: "monthly" },
    { path: "/webinars", priority: 0.6, changeFrequency: "monthly" },
    { path: "/press", priority: 0.5, changeFrequency: "monthly" },
    { path: "/resources/templates", priority: 0.7, changeFrequency: "weekly" },
    { path: "/tools", priority: 0.8, changeFrequency: "weekly" },
    { path: "/tools/best-time", priority: 0.7, changeFrequency: "weekly" },
    { path: "/tools/caption-generator", priority: 0.7, changeFrequency: "weekly" },
    { path: "/tools/character-counter", priority: 0.7, changeFrequency: "weekly" },
    { path: "/tools/engagement-rate", priority: 0.7, changeFrequency: "weekly" },
    { path: "/tools/hashtag-generator", priority: 0.7, changeFrequency: "weekly" },
    { path: "/legal/privacy", priority: 0.3, changeFrequency: "monthly" },
    { path: "/legal/terms", priority: 0.3, changeFrequency: "monthly" },
    { path: "/legal/cookies", priority: 0.3, changeFrequency: "monthly" },
    { path: "/legal/dpa", priority: 0.3, changeFrequency: "monthly" },
    { path: "/legal/data-deletion", priority: 0.3, changeFrequency: "monthly" },
  ];

  // Dynamic feature sub-pages
  const featureRoutes = Object.keys(FEATURE_PAGES).map((slug) => ({
    path: `/features/${slug}`,
    priority: 0.8,
    changeFrequency: "weekly" as const,
  }));

  // Dynamic solution sub-pages
  const solutionRoutes = Object.keys(SOLUTION_PAGES).map((slug) => ({
    path: `/solutions/${slug}`,
    priority: 0.8,
    changeFrequency: "weekly" as const,
  }));

  // Dynamic blog articles
  const blogRoutes = BLOG_POSTS.map((post) => ({
    path: `/blog/${post.slug}`,
    priority: 0.7,
    changeFrequency: "monthly" as const,
  }));

  // Dynamic guides
  const guideRoutes = GUIDES.map((guide) => ({
    path: `/guides/${guide.slug}`,
    priority: 0.7,
    changeFrequency: "monthly" as const,
  }));

  // Dynamic customer / workflow stories
  const customerRoutes = CUSTOMERS.map((cust) => ({
    path: `/customers/${cust.slug}`,
    priority: 0.7,
    changeFrequency: "monthly" as const,
  }));

  // Dynamic job postings
  const jobRoutes = JOBS.map((job) => ({
    path: `/careers/${job.slug}`,
    priority: 0.6,
    changeFrequency: "monthly" as const,
  }));

  const allRoutes = [
    ...coreRoutes,
    ...featureRoutes,
    ...solutionRoutes,
    ...blogRoutes,
    ...guideRoutes,
    ...customerRoutes,
    ...jobRoutes,
  ];

  return allRoutes.map((item) => ({
    url: `${baseUrl}${item.path}`,
    lastModified: now,
    changeFrequency: item.changeFrequency,
    priority: item.priority,
  }));
}
