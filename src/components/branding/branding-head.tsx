import { metaAttr, type HeadTag } from "@/lib/branding/tags";

/**
 * The admin's meta and link tags, written into the HTML head on the server so a
 * crawler that downloads the page sees them (search-engine ownership checks need that).
 * Values were validated when saved; React escapes them on output.
 */
export function BrandingHead({ tags }: { tags: HeadTag[] }) {
  return (
    <>
      {tags.map((t) =>
        t.kind === "meta" ? (
          <meta key={t.id} {...{ [metaAttr(t.key)]: t.key }} content={t.content} />
        ) : (
          <link key={t.id} rel={t.rel} href={t.href} />
        ),
      )}
    </>
  );
}
