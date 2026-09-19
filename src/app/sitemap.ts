import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/env";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = appUrl().replace(/\/$/, "");
  const now = new Date();

  const routes: Array<{ path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" }> = [
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
    { path: "/help", priority: 0.6, changeFrequency: "monthly" },
    { path: "/roadmap", priority: 0.6, changeFrequency: "weekly" },
    { path: "/status", priority: 0.5, changeFrequency: "daily" },
    { path: "/tools", priority: 0.7, changeFrequency: "weekly" },
    { path: "/legal/privacy", priority: 0.3, changeFrequency: "monthly" },
    { path: "/legal/terms", priority: 0.3, changeFrequency: "monthly" },
    { path: "/legal/cookies", priority: 0.3, changeFrequency: "monthly" },
    { path: "/legal/dpa", priority: 0.3, changeFrequency: "monthly" },
    { path: "/legal/data-deletion", priority: 0.3, changeFrequency: "monthly" },
  ];

  return routes.map((item) => ({
    url: `${baseUrl}${item.path}`,
    lastModified: now,
    changeFrequency: item.changeFrequency,
    priority: item.priority,
  }));
}
