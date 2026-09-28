// MultiPost Studio service worker.
//
// Scope is deliberately narrow: this exists to make the app installable and
// to speed up repeat loads of build assets. It does NOT cache pages, API
// responses, or anything dynamic — auth, OAuth callbacks, billing, social
// publishing, and every authenticated page always go straight to the network.
// Caching those was the explicit thing to avoid: a stale cached dashboard or
// a cached OAuth redirect would show wrong data or break sign-in.
//
// CACHE_VERSION bump = old caches deleted on the next activate, so a
// deployment can't leave a client permanently stuck on old assets ("update
// strategy" — see spec section 28 in the task that requested this file).
const CACHE_VERSION = "v1";
const CACHE_NAME = `mps-static-${CACHE_VERSION}`;

self.addEventListener("install", (event) => {
  // Take over immediately on next load rather than waiting for every tab to
  // close — the cache-first assets below are versioned by hash anyway, so an
  // in-flight page never gets a mismatched asset.
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

/** Next.js build output — filename includes a content hash, so cache-first is safe: a changed file is a new URL. */
function isImmutableStaticAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith("/_next/static/");
}

/** Brand icons — small, rarely change, fine to cache-first with the rest of static. */
function isIconAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith("/icons/");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never touch mutations

  const url = new URL(req.url);
  if (!(isImmutableStaticAsset(url) || isIconAsset(url))) return; // everything else: default browser network behavior, untouched

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
