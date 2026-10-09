import type { Metadata } from "next";
import { requireAdminPermission } from "@/lib/session";
import type { RawParams } from "@/lib/admin-query";
import { loadBranding } from "@/lib/branding/store";
import { loadStatCounts } from "@/lib/branding/stats";
import { BrandingClient } from "./branding-client";
import { TABS, type TabId } from "./_tabs";

export const metadata: Metadata = { title: "Admin · Site Branding" };
export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminBrandingPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  await requireAdminPermission("marketing.view");
  const raw = await searchParams;
  const asked = one(raw.tab);
  const tab: TabId = (TABS as readonly string[]).includes(asked ?? "") ? (asked as TabId) : "social";
  const [config, counts] = await Promise.all([loadBranding(), loadStatCounts()]);
  return <BrandingClient initialConfig={config} initialTab={tab} counts={counts} />;
}
