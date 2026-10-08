import Link from "next/link";
import { isExternal, type RenderLink } from "@/lib/footer/resolve";

/** A link that opens in a new tab (with safe rel) when it leaves the site or the admin asked for it. */
export function FooterAnchor({ link, className, children }: { link: RenderLink; className?: string; children?: React.ReactNode }) {
  const external = isExternal(link.href) || link.href.startsWith("mailto:") || link.href.startsWith("tel:");
  if (external || link.newTab) {
    return (
      <a href={link.href} className={className} {...(link.newTab || isExternal(link.href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {children ?? link.label}
      </a>
    );
  }
  return (
    <Link href={link.href} className={className}>
      {children ?? link.label}
    </Link>
  );
}
