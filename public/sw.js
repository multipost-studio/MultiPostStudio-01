// MultiPost Studio service worker.
//
// Scope is deliberately narrow: this exists to make the app installable and
// to speed up repeat loads of build assets. It does NOT cache pages, API
// responses, or anything dynamic — auth, OAuth callbacks, billing, social
// publishing, and every authenticated page always go straight to the network.

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
  const CACHE_VERSION = "v2";
  const CACHE_NAME = `mps-static-${CACHE_VERSION}`;

  self.addEventListener("install", (event) => {
    self.skipWaiting();
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
