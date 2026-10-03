import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Reveal } from "@/components/motion";
import { PlatformBadge } from "@/components/brand";
import { CAPABILITIES } from "@/lib/social/capabilities";
import type { PlatformKey } from "@/lib/constants";

/* Answer-first summary box (AEO): the page's direct answer, extractable. */
export function KeyTakeaways({ points }: { points: string[] }) {
  return (
    <Reveal>
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--text-subtle)]">
          Key takeaways
        </p>
        <ul className="mt-3 space-y-2.5">
          {points.map((t) => (
            <li key={t} className="flex items-start gap-2.5 text-[14.5px] font-medium leading-relaxed text-[var(--text)]">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[var(--success)]" />
              {t}
            </li>
          ))}
        </ul>
      </div>
    </Reveal>
  );
}

/* Capability matrix rendered live from the product's single source of truth.
   Never hard-code publish/media/limit claims — they drift. */
export function PlatformCapabilityTable({ platform }: { platform: PlatformKey }) {
  const cap = CAPABILITIES[platform];
  if (!cap) return null;
  return (
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)]">
      <table className="w-full min-w-[560px] border-collapse bg-[var(--surface)] text-left text-[13.5px]">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--bg-sunken)]">
            <th className="px-4 py-3 font-bold text-[var(--text)]">Content type</th>
            <th className="px-4 py-3 font-bold text-[var(--text)]">Text limit</th>
            <th className="px-4 py-3 font-bold text-[var(--text)]">Media</th>
            <th className="px-4 py-3 font-bold text-[var(--text)]">Publishing</th>
          </tr>
        </thead>
        <tbody>
          {cap.contentTypes.map((c) => (
            <tr key={c.type} className="border-b border-[var(--border)] last:border-b-0">
              <td className="px-4 py-3 font-semibold text-[var(--text)]">{c.label}</td>
              <td className="px-4 py-3 tabular-nums text-[var(--text-muted)]">{c.charLimit.toLocaleString()}</td>
              <td className="px-4 py-3 text-[var(--text-muted)]">
                {c.media.min === 0 ? "Optional" : "Required"}
                {c.media.max > 0 && ` · up to ${c.media.max}`}
                {c.media.kinds.length > 0 && ` · ${c.media.kinds.join(" / ")}`}
              </td>
              <td className="px-4 py-3">
                {c.publish === "api" ? (
                  <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--success)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" /> Direct API
                  </span>
                ) : (
                  <span className="font-semibold text-[var(--warning)]">Not available</span>
                )}
                {c.note && <span className="mt-0.5 block text-[12.5px] font-normal text-[var(--text-subtle)]">{c.note}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* Internal-link grid to related pages with descriptive anchors. */
export function RelatedGrid({ items }: { items: { href: string; title: string; body: string }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((r) => (
        <Link
          key={r.href}
          href={r.href}
          className="group rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow)]"
        >
          <span className="flex items-center gap-1.5 text-[15px] font-bold text-[var(--text)]">
            {r.title}
            <ArrowRight size={14} className="text-[var(--primary)] transition-transform group-hover:translate-x-0.5" />
          </span>
          <span className="mt-1 block text-[13.5px] leading-relaxed text-[var(--text-muted)]">{r.body}</span>
        </Link>
      ))}
    </div>
  );
}

/* Platform badge + label row used on index pages. */
export function PlatformRow({ platform, label, desc }: { platform: string; label: string; desc: string }) {
  return (
    <span className="flex items-center gap-3">
      <PlatformBadge platform={platform} size={32} className="rounded-[9px]" />
      <span className="min-w-0">
        <span className="block text-[15px] font-bold text-[var(--text)]">{label}</span>
        <span className="block truncate text-[13px] text-[var(--text-muted)]">{desc}</span>
      </span>
    </span>
  );
}

/* SoftwareApplication entity (GEO): what the product is, in schema. No
   ratings, no reviews — only verifiable facts. */
export function SoftwareAppJsonLd({ baseUrl }: { baseUrl: string }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "MultiPost Studio",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          url: baseUrl,
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "Free forever plan" },
          featureList:
            "Social media scheduling, multi-platform publishing, content calendar, unified inbox, analytics, AI content studio, approval workflows, evergreen recycling",
        }),
      }}
    />
  );
}
