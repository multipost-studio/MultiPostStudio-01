import type { Metadata, Viewport } from "next";
import { Work_Sans, Geist_Mono, Bricolage_Grotesque, Fraunces, Caveat } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/ui/toast";
import { ConfirmProvider } from "@/components/ui/confirm";

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

const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "G-4RK78J1MJR";

export const metadata: Metadata = {
  title: { default: "MultiPost Studio — Social Media Operating System", template: "%s · MultiPost Studio" },
  description:
    "The AI-powered social media operating system. Ideate, create, plan, approve, publish, engage, analyze and optimize — in one workspace.",
};

/* viewport-fit=cover lets fixed/sticky chrome extend into the notch area so
   safe-area insets (env()) actually resolve on iOS Safari. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6fbf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1b18" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} ${serif.variable} ${script.variable} h-full antialiased`}
    >
      <head>
        {gaMeasurementId && (
          <>
            <script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
            />
            <script
              id="google-tag-init"
              dangerouslySetInnerHTML={{
                __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaMeasurementId}');`,
              }}
            />
          </>
        )}
      </head>
      <body className="min-h-full" suppressHydrationWarning>
        <ThemeProvider>
          <ToastProvider>
            <ConfirmProvider>{children}</ConfirmProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
