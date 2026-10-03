import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section, Prose, CTA, Breadcrumbs } from "../../_components";
import { Reveal } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { getBlogPosts, getBlogPost } from "@/lib/cms";
import { appUrl } from "@/lib/env";

import { redirect, RedirectType } from "next/navigation";
import { db } from "@/lib/db";

export async function generateStaticParams() {
  return (await getBlogPosts()).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await getBlogPost(slug);
  const baseUrl = appUrl().replace(/\/$/, "");
  return {
    title: p ? p.title : "Post",
    description: p?.excerpt,
    alternates: {
      canonical: p ? `${baseUrl}/blog/${p.slug}` : undefined,
    },
    openGraph: {
      title: p?.title,
      description: p?.excerpt,
      url: p ? `${baseUrl}/blog/${p.slug}` : undefined,
      type: "article",
      publishedTime: p?.date,
      authors: p?.author ? [p.author] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: p?.title,
      description: p?.excerpt,
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // Check 301/replace redirects
  const redirectTarget = await db.blogRedirect.findUnique({ where: { fromSlug: slug } }).catch(() => null);
  if (redirectTarget) {
    redirect(`/blog/${redirectTarget.toSlug}`, RedirectType.replace);
  }

  const post = await getBlogPost(slug);
  if (!post) notFound();

  // Async tracking: increment view counter and record event (skip during static build)
  if (process.env.NEXT_PHASE !== "phase-production-build") {
    db.blogPost.updateMany({
      where: { slug: post.slug },
      data: { views: { increment: 1 } },
    }).catch(() => {});
  }

  const baseUrl = appUrl().replace(/\/$/, "");

  return (
    <main>
      <Breadcrumbs items={[{ name: "Blog", path: "/blog" }, { name: post.title, path: `/blog/${slug}` }]} />
      {/* BlogPosting structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            headline: post.title,
            description: post.excerpt,
            datePublished: post.date,
            author: { "@type": "Person", name: post.author },
            publisher: {
              "@type": "Organization",
              name: "MultiPost Studio",
              url: baseUrl,
            },
            mainEntityOfPage: `${baseUrl}/blog/${post.slug}`,
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
