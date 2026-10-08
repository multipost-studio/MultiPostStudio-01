/**
 * Hosts a custom script tag may load from. This mirrors the script-src list in
 * next.config.ts: the browser refuses anything else, so accepting another host
 * here would save a tag that can never run. To allow a new host, add it to the CSP
 * in next.config.ts and to this list together.
 */
export const SCRIPT_SRC_HOSTS = ["www.googletagmanager.com"] as const;
