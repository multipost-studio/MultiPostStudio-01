import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section, Prose, CTA, Breadcrumbs } from "../../_components";
import { Reveal } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { getBlogPosts, getBlogPost } from "@/lib/cms";
import { appUrl } from "@/lib/env";
import { Markdown } from "@/components/markdown";
import { BlogCover } from "@/components/blog/blog-cover";
import { ReadingProgress } from "@/components/blog/reading-progress";
import { extractFaq, headingsOf, parseMarkdown, wordCount } from "@/lib/markdown";

import { redirect, RedirectType } from "next/navigation";
import { db } from "@/lib/db";

// Posts are static once published; refresh every minute so edits and new posts show quickly.
export const revalidate = 60;

export async function generateStaticParams() {
  return (await getBlogPosts()).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await getBlogPost(slug);
  const baseUrl = appUrl().replace(/\/$/, "");
  return {
    title: p ? (p.seoTitle ?? p.title) : "Post",
    description: p?.seoDescription ?? p?.excerpt,
    keywords: p?.keywords?.length ? p.keywords : undefined,
    alternates: {
      canonical: p ? `${baseUrl}/blog/${p.slug}` : undefined,
    },
    openGraph: {
      title: p?.seoTitle ?? p?.title,
      description: p?.seoDescription ?? p?.excerpt,
      url: p ? `${baseUrl}/blog/${p.slug}` : undefined,
      type: "article",
      publishedTime: p?.date,
      modifiedTime: p?.updated,
      section: p?.tag,
      authors: p?.author ? [p.author] : undefined,
      images: p ? [{ url: `${baseUrl}/blog/${p.slug}/og`, width: 1200, height: 630, alt: p.title }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: p?.seoTitle ?? p?.title,
      description: p?.seoDescription ?? p?.excerpt,
      images: p ? [`${baseUrl}/blog/${p.slug}/og`] : undefined,
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

  // Structured content: headings for the contents list, Q&A for FAQ rich results.
  const blocks = post.markdown ? parseMarkdown(post.markdown) : [];
  const sections = headingsOf(blocks);
  const faq = extractFaq(blocks);
  const related = (await getBlogPosts())
    .filter((r) => r.slug !== post.slug)
    .sort((a, b) => Number(b.tag === post.tag) - Number(a.tag === post.tag) || +new Date(b.date) - +new Date(a.date))
    .slice(0, 3);

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
            ...(post.updated ? { dateModified: post.updated } : {}),
            articleSection: post.tag,
            inLanguage: "en",
            ...(post.markdown ? { wordCount: wordCount(post.markdown) } : {}),
            ...(post.keywords?.length ? { keywords: post.keywords.join(", ") } : {}),
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
      {faq.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: faq.map((f) => ({
                "@type": "Question",
                name: f.question,
                acceptedAnswer: { "@type": "Answer", text: f.answer },
              })),
            }),
          }}
        />
      )}
      <ReadingProgress />
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
        <Reveal delay={0.08}>
          <BlogCover slug={post.slug} title={post.title} category={post.tag} size="lg" className="mt-6 rounded-[var(--radius-xl)] shadow-lg" />
        </Reveal>
        {sections.length >= 3 && (
          <nav aria-label="In this article" className="mx-auto mt-6 max-w-2xl rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">In this article</p>
            <ol className="mt-2 grid gap-1 text-[14.5px] sm:grid-cols-2">
              {sections.map((h) => (
                <li key={h.id}>
                  <a href={`#${h.id}`} className="text-[var(--text-muted)] hover:text-[var(--primary)] hover:underline">
                    {h.text}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}
        <div id="article-body" className="mt-8">
          <Prose>
            {post.markdown ? (
              <Markdown source={post.markdown} />
            ) : (
              post.body.map((para, i) => <p key={i}>{para}</p>)
            )}
          </Prose>
        </div>
        {related.length > 0 && (
          <aside aria-label="Keep reading" className="mx-auto mt-12 max-w-2xl">
            <h2 className="text-[18px] font-bold text-[var(--text)]">Keep reading</h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-3">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={`/blog/${r.slug}`}
                    className="group/card block h-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] transition-all duration-300 hover:-translate-y-1 hover:border-[var(--primary)] hover:shadow-lg"
                  >
                    <BlogCover slug={r.slug} title={r.title} category={r.tag} size="sm" />
                    <div className="p-3.5">
                      <Badge tone="primary">{r.tag}</Badge>
                      <p className="mt-2 text-[14.5px] font-semibold leading-snug text-[var(--text)]">{r.title}</p>
                      <p className="mt-1.5 text-[12px] text-[var(--text-subtle)]">{r.readMins} min read</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </Section>
      <CTA title="Put this into practice" body="MultiPost Studio gives you the queue, the AI and the analytics to run a steady cadence." />
    </main>
  );
}
