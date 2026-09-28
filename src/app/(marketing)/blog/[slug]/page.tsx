import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section, Prose, CTA, Breadcrumbs } from "../../_components";
import { Reveal } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { getBlogPosts, getBlogPost } from "@/lib/cms";
import { appUrl } from "@/lib/env";

export async function generateStaticParams() {
  return (await getBlogPosts()).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await getBlogPost(slug);
  return { title: p ? p.title : "Post", description: p?.excerpt };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  if (!post) notFound();

  return (
    <main>
      <Breadcrumbs items={[{ name: "Blog", path: "/blog" }, { name: post.title, path: `/blog/${slug}` }]} />
      {/* Article structured data — same fields rendered on the page, nothing extra. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: post.title,
            description: post.excerpt,
            datePublished: post.date,
            author: { "@type": "Organization", name: post.author },
            publisher: { "@type": "Organization", name: "MultiPost Studio" },
            mainEntityOfPage: `${appUrl()}/blog/${post.slug}`,
          }),
        }}
      />
      <Section narrow>
        <Reveal>
          <Link href="/blog" className="text-[14px] text-[var(--text-muted)] hover:underline">
            ← All posts
          </Link>
          <div className="mt-4">
            <Badge tone="primary">{post.tag}</Badge>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text)]">{post.title}</h1>
          <p className="mt-2 text-[14px] text-[var(--text-subtle)]">
            {post.author} · {formatDate(post.date)} · {post.readMins} min read
          </p>
        </Reveal>
        <div className="mt-8">
          <Prose>
            {post.body.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </Prose>
        </div>
      </Section>
      <CTA title="Put this into practice" body="MultiPost Studio gives you the queue, the AI and the analytics to run a steady cadence." />
    </main>
  );
}
