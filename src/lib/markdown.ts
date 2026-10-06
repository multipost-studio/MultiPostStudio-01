/**
 * Small, dependency-free Markdown parser for blog posts.
 *
 * It produces plain data (blocks + inline tokens) that React renders as
 * elements — never as raw HTML — so post content cannot inject markup or
 * scripts. Supports what long-form posts use: ## / ### / #### headings,
 * paragraphs, bullet and numbered lists, blockquotes, horizontal rules,
 * fenced code, and inline **bold**, *italic*, `code` and [links](url).
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; c: Inline[] };

export type Block =
  | { t: "h"; level: 2 | 3 | 4; id: string; c: Inline[]; text: string }
  | { t: "p"; c: Inline[]; text: string }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; items: Inline[][] }
  | { t: "quote"; c: Inline[] }
  | { t: "hr" }
  | { t: "code"; v: string };

const SAFE_HREF = /^(https?:\/\/|mailto:|\/(?!\/)|#)/i;

export function slugifyHeading(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 70) || "section"
  );
}

/** Inline parsing: links first, then bold, italic, code. Unmatched markers stay literal. */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let i = 0;
  let buf = "";
  const flush = () => {
    if (buf) out.push({ t: "text", v: buf });
    buf = "";
  };
  while (i < src.length) {
    const ch = src[i];
    if (ch === "`") {
      const end = src.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        out.push({ t: "code", v: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (ch === "[") {
      // URL may contain one level of balanced parentheses, e.g. https://en.wikipedia.org/wiki/Foo_(bar)
      const m = /^\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/.exec(src.slice(i));
      if (m) {
        flush();
        const href = m[2];
        const inner = parseInline(m[1]);
        out.push(SAFE_HREF.test(href) ? { t: "link", href, c: inner } : { t: "text", v: m[1] });
        i += m[0].length;
        continue;
      }
    }
    if (ch === "*" || ch === "_") {
      const double = src[i + 1] === ch;
      const mark = double ? ch + ch : ch;
      const end = src.indexOf(mark, i + mark.length);
      // `_` inside a word (snake_case) is not emphasis.
      const wordInternal = ch === "_" && i > 0 && /[A-Za-z0-9]/.test(src[i - 1]);
      if (end > i + mark.length && !wordInternal && !/^\s/.test(src.slice(i + mark.length, i + mark.length + 1))) {
        flush();
        const inner = parseInline(src.slice(i + mark.length, end));
        out.push(double ? { t: "strong", c: inner } : { t: "em", c: inner });
        i = end + mark.length;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

export function inlineText(c: Inline[]): string {
  return c
    .map((n) => (n.t === "text" || n.t === "code" ? n.v : inlineText(n.c)))
    .join("");
}

const UL = /^\s*[-*+]\s+(.*)$/;
const OL = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^(#{2,4})\s+(.*?)\s*#*\s*$/;

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  const usedIds = new Map<string, number>();
  let i = 0;

  const uniqueId = (base: string) => {
    const n = usedIds.get(base) ?? 0;
    usedIds.set(base, n + 1);
    return n === 0 ? base : `${base}-${n + 1}`;
  };

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.trim().startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) body.push(lines[i++]);
      i++;
      blocks.push({ t: "code", v: body.join("\n") });
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      const text = inlineText(parseInline(h[2]));
      blocks.push({ t: "h", level: h[1].length as 2 | 3 | 4, id: uniqueId(slugifyHeading(text)), c: parseInline(h[2]), text });
      i++;
      continue;
    }
    // A lone "# Title" inside a post would be a second H1; render it as a section heading instead.
    const h1 = /^#\s+(.*)$/.exec(line);
    if (h1) {
      const text = inlineText(parseInline(h1[1]));
      blocks.push({ t: "h", level: 2, id: uniqueId(slugifyHeading(text)), c: parseInline(h1[1]), text });
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ t: "hr" });
      i++;
      continue;
    }
    if (UL.test(line) || OL.test(line)) {
      const ordered = OL.test(line) && !UL.test(line);
      const re = ordered ? OL : UL;
      const items: Inline[][] = [];
      while (i < lines.length && re.test(lines[i])) {
        let text = (re.exec(lines[i]) as RegExpExecArray)[1];
        i++;
        // continuation lines of the same item (indented, not a new marker)
        while (i < lines.length && lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && !UL.test(lines[i]) && !OL.test(lines[i])) text += " " + lines[i++].trim();
        items.push(parseInline(text));
      }
      blocks.push({ t: ordered ? "ol" : "ul", items });
      continue;
    }
    if (line.trim().startsWith(">")) {
      const q: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) q.push(lines[i++].replace(/^\s*>\s?/, ""));
      blocks.push({ t: "quote", c: parseInline(q.join(" ")) });
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !HEADING.test(lines[i]) &&
      !UL.test(lines[i]) &&
      !OL.test(lines[i]) &&
      !lines[i].trim().startsWith(">") &&
      !lines[i].trim().startsWith("```")
    ) {
      para.push(lines[i++].trim());
    }
    const text = para.join(" ");
    blocks.push({ t: "p", c: parseInline(text), text: inlineText(parseInline(text)) });
  }
  return blocks;
}

export type FaqItem = { question: string; answer: string };

/** Pull Q&A pairs from a "Frequently asked questions" / "FAQ" section: each `###` is a question, the paragraphs after it are the answer. */
export function extractFaq(blocks: readonly Block[]): FaqItem[] {
  const items: FaqItem[] = [];
  let inFaq = false;
  let current: { question: string; answer: string[] } | null = null;
  const close = () => {
    if (current && current.answer.length) items.push({ question: current.question, answer: current.answer.join(" ") });
    current = null;
  };
  for (const b of blocks) {
    if (b.t === "h" && b.level === 2) {
      close();
      inFaq = /\b(faq|frequently asked questions)\b/i.test(b.text);
      continue;
    }
    if (!inFaq) continue;
    if (b.t === "h" && b.level === 3) {
      close();
      current = { question: b.text, answer: [] };
    } else if (current) {
      if (b.t === "p") current.answer.push(b.text);
      else if (b.t === "ul" || b.t === "ol") current.answer.push(b.items.map((it) => inlineText(it)).join("; "));
    }
  }
  close();
  return items;
}

export function headingsOf(blocks: readonly Block[]): { id: string; text: string }[] {
  return blocks.filter((b): b is Extract<Block, { t: "h" }> => b.t === "h" && b.level === 2).map((b) => ({ id: b.id, text: b.text }));
}

export function wordCount(src: string): number {
  return src.trim() ? src.trim().split(/\s+/).length : 0;
}
