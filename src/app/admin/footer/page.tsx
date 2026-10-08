import type { Metadata } from "next";
import { PanelBottom } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/session";
import { getAllNavLinks } from "@/lib/cms";
import { appUrl } from "@/lib/env";
import { loadFooterConfig } from "@/lib/footer/store";
import { loadBranding } from "@/lib/branding/store";
import { FooterClient } from "./footer-client";

export const metadata: Metadata = { title: "Admin · Footer & Links" };
export const dynamic = "force-dynamic";

export default async function AdminFooterPage() {
  await requirePlatformAdmin();
  const [config, nav, branding] = await Promise.all([loadFooterConfig(), getAllNavLinks(), loadBranding()]);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-3 text-3xl font-semibold leading-tight tracking-tight text-[var(--text)] sm:text-[40px]">
          <PanelBottom className="h-8 w-8 shrink-0 text-[var(--primary)]" aria-hidden /> Footer &amp; Links
        </h1>
        <p className="mt-1 max-w-3xl text-[15px] text-[var(--text-muted)]">
          Everything in the public site footer: link columns, social icons, your other web apps, contact details and legal text. Changes show up on every marketing page within a minute.
        </p>
      </div>
      <FooterClient initialConfig={config} nav={nav} appUrl={appUrl()} branding={{ social: branding.social, credits: branding.credits }} />
    </div>
  );
}
