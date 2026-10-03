import type { Metadata } from "next";
import { MarketingHero } from "./_hero";
import { isFeatureEnabled } from "@/lib/feature-flags";
import {
  AiSection,
  AnalyticsShowcase,
  CapabilitiesGrid,
  CollabShowcase,
  CreateShowcase,
  EngageShowcase,
  FinalCta,
  OpenCompany,
  PlanShowcase,
  PlatformBar,
  PublishShowcase,
  ResourcesSection,
  TrustSection,
  WorkflowRail,
} from "./_landing-sections";

export const metadata: Metadata = {
  title: {
    absolute: "MultiPost Studio — Your whole social workflow, in one workspace",
  },
  description:
    "Plan, create, schedule, publish, engage and analyze across Instagram, Facebook, LinkedIn, X, TikTok, YouTube, Pinterest, Threads and more — from one workspace. Free forever plan, no credit card required.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "MultiPost Studio — Your whole social workflow, in one workspace",
    description:
      "Plan, create, schedule, publish, engage and analyze across every platform — from one workspace. Free forever plan, no credit card required.",
    url: "/",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MultiPost Studio — Your whole social workflow, in one workspace",
    description:
      "Plan, create, schedule, publish, engage and analyze across every platform — from one workspace.",
  },
};

/* Landing narrative: hero → platforms → workflow → product story
   (plan · create · AI · publish · engage · analyze · collaborate) →
   capabilities → trust → resources → open company → final CTA. */
export default async function LandingPage() {
  // Admin-controlled: /admin/flags -> "demo_login".
  const demoLogin = await isFeatureEnabled("demo_login");
  return (
    <main>
      <MarketingHero demoLogin={demoLogin} />
      <PlatformBar />
      <WorkflowRail />
      <PlanShowcase />
      <CreateShowcase />
      <AiSection />
      <PublishShowcase />
      <EngageShowcase />
      <AnalyticsShowcase />
      <CollabShowcase />
      <CapabilitiesGrid />
      <TrustSection />
      <ResourcesSection />
      <OpenCompany />
      <FinalCta />
    </main>
  );
}
