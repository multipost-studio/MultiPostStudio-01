import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/env";
import { getBlogPosts, getCustomers, getFeaturePages, getGuides, getJobs, getSolutionPages } from "@/lib/cms";

// Reads the same CMS getters the pages render from (DB rows, falling back to
// the _data.ts seed) instead of importing the seed arrays directly — a
// sitemap built from the seed drifts from reality the moment an admin edits,
// adds, or removes content at /admin/content.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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

  const [featurePages, solutionPages, blogPosts, guides, customers, jobs] = await Promise.all([
    getFeaturePages(),
    getSolutionPages(),
    getBlogPosts(),
    getGuides(),
    getCustomers(),
    getJobs(),
  ]);

  // Dynamic feature sub-pages
  const featureRoutes = Object.keys(featurePages).map((slug) => ({
    path: `/features/${slug}`,
    priority: 0.8,
    changeFrequency: "weekly" as const,
  }));

  // Dynamic solution sub-pages
  const solutionRoutes = Object.keys(solutionPages).map((slug) => ({
    path: `/solutions/${slug}`,
    priority: 0.8,
    changeFrequency: "weekly" as const,
  }));

  // Dynamic blog articles
  const blogRoutes = blogPosts.map((post) => ({
    path: `/blog/${post.slug}`,
    priority: 0.7,
    changeFrequency: "monthly" as const,
  }));

  // Dynamic guides
  const guideRoutes = guides.map((guide) => ({
    path: `/guides/${guide.slug}`,
    priority: 0.7,
    changeFrequency: "monthly" as const,
  }));

  // Dynamic customer / workflow stories
  const customerRoutes = customers.map((cust) => ({
    path: `/customers/${cust.slug}`,
    priority: 0.7,
    changeFrequency: "monthly" as const,
  }));

  // Dynamic job postings
  const jobRoutes = jobs.map((job) => ({
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
