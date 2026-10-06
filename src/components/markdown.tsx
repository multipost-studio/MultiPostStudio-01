import * as React from "react";
import Link from "next/link";
import { parseMarkdown, type Block, type Inline } from "@/lib/markdown";

/**
 * Renders parsed Markdown as React elements (never raw HTML), so post content
 * can't inject markup. Server-component safe: no hooks, no state.
 */

function Inlines({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.t) {
          case "text":
            return <React.Fragment key={i}>{n.v}</React.Fragment>;
          case "strong":
            return (
              <strong key={i} className="font-bold text-[var(--text)]">
                <Inlines nodes={n.c} />
              </strong>
            );
          case "em":
            return (
              <em key={i}>
                <Inlines nodes={n.c} />
              </em>
            );
          case "code":
            return (
              <code key={i} className="rounded bg-[var(--bg-sunken)] px-1 py-0.5 text-[0.9em] text-[var(--text)]">
                {n.v}
              </code>
            );
          case "link": {
            const external = /^https?:\/\//i.test(n.href);
            return external ? (
              <a key={i} href={n.href} target="_blank" rel="noopener noreferrer nofollow">
                <Inlines nodes={n.c} />
              </a>
            ) : (
              <Link key={i} href={n.href}>
                <Inlines nodes={n.c} />
              </Link>
            );
          }
        }
      })}
    </>
  );
}

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case "h": {
      const cls = "scroll-mt-24";
      if (b.level === 2)
        return (
          <h2 id={b.id} className={cls}>
            <Inlines nodes={b.c} />
          </h2>
        );
      if (b.level === 3)
        return (
          <h3 id={b.id} className={cls}>
            <Inlines nodes={b.c} />
          </h3>
        );
      return (
        <h4 id={b.id} className={`${cls} font-bold text-[var(--text)]`}>
          <Inlines nodes={b.c} />
        </h4>
      );
    }
    case "p":
      return (
        <p>
          <Inlines nodes={b.c} />
        </p>
      );
    case "ul":
      return (
        <ul>
          {b.items.map((it, i) => (
            <li key={i}>
              <Inlines nodes={it} />
            </li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="list-decimal pl-5">
          {b.items.map((it, i) => (
            <li key={i} className="mt-1">
              <Inlines nodes={it} />
            </li>
          ))}
        </ol>
      );
    case "quote":
      return (
        <blockquote className="rounded-[var(--radius-md)] bg-[var(--primary-soft)]/50 px-4 py-3 italic text-[var(--text)]">
          <Inlines nodes={b.c} />
        </blockquote>
      );
    case "hr":
      return <hr className="border-[var(--border)]" />;
    case "code":
      return (
        <pre className="overflow-x-auto rounded-[var(--radius-md)] bg-[var(--bg-sunken)] p-3 text-[13px] text-[var(--text)]">
          <code>{b.v}</code>
        </pre>
      );
  }
}

export function MarkdownBlocks({ blocks }: { blocks: readonly Block[] }) {
  return (
    <>
      {blocks.map((b, i) => (
        <BlockView key={i} b={b} />
      ))}
    </>
  );
}

export function Markdown({ source }: { source: string }) {
  return <MarkdownBlocks blocks={parseMarkdown(source)} />;
}
