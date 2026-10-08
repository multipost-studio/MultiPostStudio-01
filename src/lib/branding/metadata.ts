import type { Metadata } from "next";
import type { BrandingConfig } from "./config";
import { loadBranding } from "./store";

/** The default share image: the admin's choice from Site Branding, else the logo. */
export const FALLBACK_SHARE_IMAGE = "/media/logo-light.png";

export function shareImages(share: BrandingConfig["share"]): { url: string; alt: string }[] {
  return [{ url: share.imageUrl || FALLBACK_SHARE_IMAGE, alt: share.imageAlt || "MultiPost Studio" }];
}

export function twitterSite(share: BrandingConfig["share"]): string | undefined {
  const h = share.twitterHandle.trim();
  if (!h) return undefined;
  return h.startsWith("@") ? h : `@${h}`;
}

/**
 * A page that sets its own `openGraph` or `twitter` replaces the site-wide ones
 * entirely (Next merges those objects shallowly), which silently drops the share
 * image. This puts the Site Branding image back unless the page chose one itself.
 */
export function applyShareImage(meta: Metadata, share: BrandingConfig["share"]): Metadata {
  const images = shareImages(share);
  const site = twitterSite(share);
  return {
    ...meta,
    openGraph: meta.openGraph ? { ...meta.openGraph, images: meta.openGraph.images ?? images } : meta.openGraph,
    twitter: meta.twitter ? { ...meta.twitter, images: meta.twitter.images ?? images, ...(site && !meta.twitter.site ? { site } : {}) } : meta.twitter,
  };
}

export async function withShareImage(meta: Metadata): Promise<Metadata> {
  return applyShareImage(meta, (await loadBranding()).share);
}
