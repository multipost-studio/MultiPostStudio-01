// MultiPost Studio service worker.
//
// Scope is deliberately narrow: this exists to make the app installable, to speed up repeat loads of build assets, and
// to show a friendly page instead of the browser's "no internet" screen when a page cannot be reached. It does NOT cache
// pages, API responses, or anything dynamic — auth, OAuth callbacks, billing, social publishing, and every authenticated
// page always go straight to the network. The one page it keeps is /offline, which is public and the same for everyone.

const isLocalhost =
  Boolean(self.location.hostname === "localhost") ||
  self.location.hostname === "[::1]" ||
  self.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/);

if (isLocalhost) {
  // In development, immediately clear any cached assets and unregister
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (event) => {
    event.waitUntil(
      caches.keys()
        .then((names) => Promise.all(names.map((n) => caches.delete(n))))
        .then(() => self.registration.unregister())
        .then(() => self.clients.claim())
    );
  });
} else {
  // Bumped with the brand refresh: icons are served cache-first, so returning visitors and installed apps would keep the old ones.
  const CACHE_VERSION = "v4";
  const CACHE_NAME = `mps-static-${CACHE_VERSION}`;

  const OFFLINE_URL = "/offline";

  // Keep a copy of /offline and the build assets it needs (styles, fonts, scripts), so it renders and its Retry button works
  // with no connection. Best effort: if any of this fails the app still installs and works, it just has no offline page.
  async function precacheOfflinePage() {
    const cache = await caches.open(CACHE_NAME);
    const res = await fetch(OFFLINE_URL, { cache: "reload", credentials: "same-origin" });
    // A redirect here would mean something unexpected (a sign-in page): never keep that as the offline page.
    if (!res.ok || res.redirected) return;
    const html = await res.clone().text();
    await cache.put(OFFLINE_URL, res);
    const assets = Array.from(new Set(Array.from(html.matchAll(/\/_next\/static\/[^"'\s\\)<>]+/g), (m) => m[0])));
    await Promise.all(assets.map((a) => cache.add(a).catch(() => undefined)));
  }

  self.addEventListener("install", (event) => {
    self.skipWaiting();
    event.waitUntil(precacheOfflinePage().catch(() => undefined));
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      (async () => {
        const names = await caches.keys();
        await Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)));
        await self.clients.claim();
      })(),
    );
  });

  function isImmutableStaticAsset(url) {
    return url.origin === self.location.origin && url.pathname.startsWith("/_next/static/");
  }

  function isIconAsset(url) {
    return url.origin === self.location.origin && url.pathname.startsWith("/icons/");
  }

  self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (req.method !== "GET") return;

    // A page load that cannot reach the server shows the offline page instead of the browser's error screen. Every page load
    // still goes to the network first; the stored copy is only used when that fails outright (no connection), never for a
    // slow or failing server, so nothing authenticated is ever served from here.
    if (req.mode === "navigate") {
      event.respondWith(
        fetch(req).catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match(OFFLINE_URL)) || Response.error();
        }),
      );
      return;
    }

    const url = new URL(req.url);
    if (!(isImmutableStaticAsset(url) || isIconAsset(url))) return;

    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })(),
    );
  });
}
