import type { CustomTag } from "./config";

export type HeadTag =
  | { id: string; kind: "meta"; key: string; content: string }
  | { id: string; kind: "link"; rel: string; href: string };
export type ScriptTag = { id: string; placement: "head" | "body"; consent: "essential" | "analytics"; src: string; code: string };

/**
 * Splits the admin's tags into what the server writes into the page (meta and link
 * tags: search-engine verification has to be in the HTML a crawler downloads) and
 * what the browser adds later (scripts, only after any needed consent).
 */
export function partitionTags(tags: CustomTag[]): { head: HeadTag[]; scripts: ScriptTag[] } {
  const head: HeadTag[] = [];
  const scripts: ScriptTag[] = [];
  for (const t of tags) {
    if (!t.enabled) continue;
    if (t.kind === "meta") head.push({ id: t.id, kind: "meta", key: t.key, content: t.content });
    else if (t.kind === "link") head.push({ id: t.id, kind: "link", rel: t.rel, href: t.href });
    else scripts.push({ id: t.id, placement: t.placement, consent: t.consent, src: t.src.trim(), code: t.code });
  }
  return { head, scripts };
}

/** Open Graph style keys use `property`; everything else (verification codes included) uses `name`. */
export function metaAttr(key: string): "property" | "name" {
  return /^(og|article|fb|product|music|video|book|profile):/i.test(key) ? "property" : "name";
}
