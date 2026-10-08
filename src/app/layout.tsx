import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/manrope";
import "@fontsource-variable/geist-mono";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { MotionProvider } from "@/components/motion-provider";
import { ConfirmProvider } from "@/components/ui/confirm";
import { appUrl } from "@/lib/env";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";
import { StaleDeployGuard } from "@/components/pwa/stale-deploy-guard";
import { ConsentBanner } from "@/components/consent/consent-banner";
import { FestivalLayer } from "@/components/festival/festival-layer";
import { GoogleAnalytics } from "@/components/consent/google-analytics";
import { BrandingHead } from "@/components/branding/branding-head";
import { CustomScripts } from "@/components/branding/custom-scripts";
import { loadBranding } from "@/lib/branding/store";
import { partitionTags } from "@/lib/branding/tags";
import { shareImages, twitterSite } from "@/lib/branding/metadata";

/* Type system: Inter for all body/UI text, Manrope for headings, metrics and
   display type. Two families, no mixing. Self-hosted variable fonts (CSS
   imports above); the family tokens live in globals.css. */

const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "G-4RK7BJ1MJR";

const DEFAULT_TITLE = "MultiPost Studio — Social Media Operating System";
const DEFAULT_DESCRIPTION =
  "The AI-powered social media operating system. Ideate, create, plan, approve, publish, engage, analyze and optimize — in one workspace.";

export async function generateMetadata(): Promise<Metadata> {
  const { share } = await loadBranding();
  const images = shareImages(share);
  const handle = twitterSite(share);
  return {
  metadataBase: new URL(appUrl()),
  title: { default: DEFAULT_TITLE, template: "%s · MultiPost Studio" },
  description: DEFAULT_DESCRIPTION,
  manifest: "/manifest.webmanifest",
  // Apple touch icon is auto-detected from src/app/apple-icon.png (Next.js
  // file convention) — already 180x180, no need to duplicate it here.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MultiPost",
  },
  openGraph: {
    type: "website",
    siteName: "MultiPost Studio",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images,
  },
  twitter: {
    card: share.cardType,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images,
    ...(handle ? { site: handle } : {}),
  },
  };
}

/* viewport-fit=cover lets fixed/sticky chrome extend into the notch area so
   safe-area insets (env()) actually resolve on iOS Safari. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Dark canvas by default; the theme script below swaps it to the light canvas when needed.
  themeColor: "#060607",
  // The on-screen keyboard resizes the page instead of covering the composer and inputs.
  interactiveWidget: "resizes-content",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const branding = await loadBranding();
  const { head: headTags, scripts: customScripts } = partitionTags(branding.tags);
  // Only real profile links an admin chose to publish: they become the organization's "sameAs" for search engines.
  const sameAs = branding.social.filter((l) => l.enabled && /^https?:\/\//i.test(l.href)).map((l) => l.href);
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <head>
        {/* Theme init: applies the stored theme (default dark) before first
            paint so there's no light/dark flash. Plain inline script — CSP
            already allows 'unsafe-inline', same as the JSON-LD block below. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("mps-theme");if(t!=="light"&&t!=="dark")t="dark";document.documentElement.dataset.theme=t;var c=t==="light"?"#eeeeef":"#060607";var set=function(){var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",c);};set();document.addEventListener("DOMContentLoaded",set);}catch(e){document.documentElement.dataset.theme="dark";}})();`,
          }}
        />
        {/* Organization + WebSite entity data for search/AI answer engines.
            Only fields verifiable from this deployment's own config — no
            founding date, headcount, ratings, or social profiles invented. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Organization",
                  "@id": `${appUrl()}#organization`,
                  name: "MultiPost Studio",
                  url: appUrl(),
                  logo: `${appUrl()}/brand/logo-512.png`,
                  ...(sameAs.length > 0 ? { sameAs } : {}),
                },
                {
                  "@type": "WebSite",
                  "@id": `${appUrl()}#website`,
                  url: appUrl(),
                  name: "MultiPost Studio",
                  description: DEFAULT_DESCRIPTION,
                  publisher: { "@id": `${appUrl()}#organization` },
                },
              ],
            }),
          }}
        />
        <BrandingHead tags={headTags} />
      </head>
      <body className="min-h-full" suppressHydrationWarning>
        <MotionProvider>
        <ToastProvider>
          <ConfirmProvider>
            {children}
            <ServiceWorkerRegistration />
            <StaleDeployGuard />
            {/* Consent-gated: loads only when the visitor's cookie choice and region allow it (see lib/consent.ts). */}
            {gaMeasurementId && <GoogleAnalytics id={gaMeasurementId} />}
            <ConsentBanner />
            {/* Admin-controlled festival themes (Admin → Festivals). Renders nothing unless one is live. */}
            <FestivalLayer />
            {/* Custom scripts from Admin → Site Branding → Custom Tags (consent-aware). */}
            <CustomScripts scripts={customScripts} />
          </ConfirmProvider>
        </ToastProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
