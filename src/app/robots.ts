import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = appUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/pricing",
          "/features",
          "/features/*",
          "/solutions",
          "/solutions/*",
          "/blog",
          "/blog/*",
          "/changelog",
          "/about",
          "/contact",
          "/security",
          "/customers",
          "/guides",
          "/guides/*",
          "/help",
          "/legal/*",
          "/roadmap",
          "/status",
          "/tools",
          "/tools/*",
        ],
        disallow: [
          "/api/",
          "/admin/",
          "/dashboard",
          "/composer/",
          "/calendar",
          "/analytics",
          "/inbox",
          "/automations",
          "/media",
          "/settings/",
          "/team",
          "/campaigns",
          "/ideas",
          "/portal/",
          "/share/",
          "/switch",
          "/onboarding",
          "/reset",
          "/forgot",
          "/verify",
        ],
      },
    ],
    sitemap: `${baseUrl.replace(/\/$/, "")}/sitemap.xml`,
  };
}
