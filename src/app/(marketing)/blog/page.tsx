import type { Metadata } from "next";
import { Hero, Section } from "../_components";
import { BlogExplorer } from "@/components/blog/blog-explorer";
import { getBlogPosts } from "@/lib/cms";

// Rendered per request (cheap: the post list is cached for 30s in-process): a scheduled post must
// appear when it comes due, not whenever a static copy next refreshes.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Blog",
  description: "Practical writing on social media scheduling, platform limits, brand voice, approvals and analytics from the MultiPost Studio team.",
};

export default async function BlogPage() {
  const posts = [...(await getBlogPosts())].sort((a, b) => +new Date(b.date) - +new Date(a.date));
  return (
    <main>
      <Hero
        eyebrow="Blog"
        title="Playbooks, platform guides and straight answers"
        subtitle="Short, practical reads on running social media well — limits, scheduling, strategy, analytics and AI."
      />
      <Section>
        <BlogExplorer
          posts={posts.map((p) => ({ slug: p.slug, title: p.title, excerpt: p.excerpt, date: p.date, author: p.author, readMins: p.readMins, tag: p.tag }))}
        />
      </Section>
    </main>
  );
}
