import { requireAdminPermission } from "@/lib/session";
import type { Metadata } from "next";
import { appUrl } from "@/lib/env";
import { getFacets } from "@/lib/marketing-analytics";
import { MarketingSubNav } from "../_sub-nav";
import { LinksClient } from "./links-client";

export const metadata: Metadata = { title: "Admin · UTM links" };
export const dynamic = "force-dynamic";

const DESTINATIONS = [
  { label: "Home", path: "/" },
  { label: "Pricing", path: "/pricing" },
  { label: "Sign up", path: "/signup" },
  { label: "Features", path: "/features" },
  { label: "Blog", path: "/blog" },
];

/** Marketing pages live on the root domain in production; elsewhere (local, previews) the app origin is the site. */
function siteOrigin(): string {
  const app = appUrl();
  try {
    return new URL(app).hostname.endsWith("multipoststudio.online") ? "https://multipoststudio.online" : new URL(app).origin;
  } catch {
    return app;
  }
}

export default async function AdminUtmLinksPage() {
  await requireAdminPermission("marketing.view");
  const facets = await getFacets();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Marketing</h1>
        <p className="mt-1 text-[14px] text-[var(--text-muted)]">
          Tag every link you share so the Acquisition report can show exactly what each campaign brings in.
        </p>
      </div>
      <MarketingSubNav />
      <LinksClient siteUrl={siteOrigin()} destinations={DESTINATIONS} campaigns={facets.campaigns} sources={facets.sources} />
    </div>
  );
}
