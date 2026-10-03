import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Work_Sans, Geist_Mono, Bricolage_Grotesque, Fraunces, Caveat } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { ConfirmProvider } from "@/components/ui/confirm";
import { appUrl } from "@/lib/env";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";

const geistSans = Work_Sans({ variable: "--font-geist-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});
const serif = Fraunces({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["italic", "normal"],
});
const script = Caveat({
  variable: "--font-script",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "G-4RK7BJ1MJR";

const DEFAULT_TITLE = "MultiPost Studio — Social Media Operating System";
const DEFAULT_DESCRIPTION =
  "The AI-powered social media operating system. Ideate, create, plan, approve, publish, engage, analyze and optimize — in one workspace.";

export const metadata: Metadata = {
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
    images: ["/media/logo-light.png"],
  },
  twitter: {
    card: "summary",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: ["/media/logo-light.png"],
  },
};

/* viewport-fit=cover lets fixed/sticky chrome extend into the notch area so
   safe-area insets (env()) actually resolve on iOS Safari. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} ${serif.variable} ${script.variable} h-full antialiased`}
    >
      <head>
        {/* Theme init: applies the stored theme (default dark) before first
            paint so there's no light/dark flash. Plain inline script — CSP
            already allows 'unsafe-inline', same as the JSON-LD block below. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("mps-theme");if(t!=="light"&&t!=="dark")t="dark";document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="dark";}})();`,
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
                  logo: `${appUrl()}/media/logo-light.png`,
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
        {gaMeasurementId && (
          <>
            {/* Raw <script> JSX tags fight React's hydration/DOM ownership —
                a documented source of both hydration mismatches and random
                "parentNode is null" crashes. next/script's afterInteractive
                strategy defers execution until after hydration completes. */}
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
              strategy="afterInteractive"
            />
            <Script id="ga-init" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaMeasurementId}');`}
            </Script>
          </>
        )}
      </head>
      <body className="min-h-full" suppressHydrationWarning>
        <ToastProvider>
          <ConfirmProvider>
            {children}
            <ServiceWorkerRegistration />
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
