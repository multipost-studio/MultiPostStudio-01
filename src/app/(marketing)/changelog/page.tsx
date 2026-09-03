import type { Metadata } from "next";
import { Hero, Section } from "../_components";
import { Reveal } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { getChangelog } from "@/lib/cms";

export const metadata: Metadata = { title: "Changelog" };

const TONE: Record<string, "success" | "info" | "warning"> = {
  new: "success",
  improved: "info",
  fixed: "warning",
};

export default async function ChangelogPage() {
  const CHANGELOG = await getChangelog();
  return (
    <main>
      <Hero eyebrow="Company" title="Changelog" subtitle="Everything we ship, in the order we ship it." />
      <Section narrow>
        <div className="space-y-10">
          {CHANGELOG.map((release) => (
            <Reveal key={release.version}>
              <div className="flex items-baseline gap-3">
                <h2 className="text-[19px] font-semibold text-[var(--text)]">v{release.version}</h2>
                <span className="text-[13px] text-[var(--text-subtle)]">{formatDate(release.date)}</span>
              </div>
              <ul className="mt-3 space-y-2">
                {release.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[15px] text-[var(--text-muted)]">
                    <Badge tone={TONE[item.type]}>{item.type}</Badge>
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          ))}
        </div>
      </Section>
    </main>
  );
}
