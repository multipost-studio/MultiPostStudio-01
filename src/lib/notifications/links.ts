/**
 * Action URLs on notifications are internal paths. A notification is rendered as a link in the app and in
 * an email, so an `https://elsewhere` or `javascript:` value (from a bad import, a future producer) would
 * turn the bell into a phishing surface. Anything that is not a plain same-site path is dropped, and the
 * notification simply has no action.
 *
 * One deliberate exception: announcements ("system" type) are written by platform admins, who may link to
 * a blog post or changelog, so those may carry an https link (never http, javascript:, data:, or one with
 * embedded credentials). Pass `allowExternalHttps` for that type only.
 */
export function safeActionUrl(url: string | null | undefined, opts: { allowExternalHttps?: boolean } = {}): string | null {
  if (typeof url !== "string") return null;
  const v = url.trim();
  if (!v || v.length > 500) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(v)) return null;
  if (v.startsWith("/")) {
    // "//host" is protocol-relative, "/\host" is treated as one by browsers.
    return v.startsWith("//") ? null : v;
  }
  if (opts.allowExternalHttps && /^https:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      if (u.protocol === "https:" && !u.username && !u.password && u.hostname.includes(".")) return v;
    } catch {
      return null;
    }
  }
  return null;
}

export const isExternalUrl = (url: string): boolean => /^https:\/\//i.test(url);
