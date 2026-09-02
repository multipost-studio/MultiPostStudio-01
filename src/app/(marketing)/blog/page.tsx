import type { Metadata } from "next";
import Link from "next/link";
import { Hero, Section } from "../_components";
import { Stagger , StaggerItem} from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { BLOG_POSTS } from "../_data";

export const metadata: Metadata = { title: "Blog" };

export default function BlogPage() {
  const posts = [...BLOG_POSTS].sort((a, b) => +new Date(b.date) - +new Date(a.date));
  return (
    <main>
      <Hero eyebrow="Blog" title="Playbooks, product notes, and opinions" subtitle="Short reads on running social media well." />
      <Section>
        <Stagger className="grid gap-4 md:grid-cols-2">
          {posts.map((p) => (
            <StaggerItem key={p.slug}>
              <Link
                href={`/blog/${p.slug}`}
                className="block h-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 transition-colors hover:border-[var(--primary)]"
              >
                <Badge tone="primary">{p.tag}</Badge>
                <h2 className="mt-2 text-[17px] font-semibold text-[var(--text)]">{p.title}</h2>
                <p className="mt-1 text-[14px] text-[var(--text-muted)]">{p.excerpt}</p>
                <p className="mt-3 text-[12px] text-[var(--text-subtle)]">
                  {p.author} · {formatDate(p.date)} · {p.readMins} min read
                </p>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>
    </main>
  );
}
