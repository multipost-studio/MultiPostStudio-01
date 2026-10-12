// MultiPost Studio service worker.
//
// Scope is deliberately narrow: this exists to make the app installable, to speed up repeat loads of build assets, and
// to show a friendly page instead of the browser's "no internet" screen when a page cannot be reached. It does NOT cache
// pages, API responses, or anything dynamic — auth, OAuth callbacks, billing, social publishing, and every authenticated
// page always go straight to the network. The one page it keeps is /offline, which is public and the same for everyone.
//
// It also receives Web Push (notifications while the app is closed), shows them, opens the right page when one is tapped, and
// tells any open window so it can refresh straight away. Push payloads carry only the notification's own text.

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

  /* ---------------- Web Push ---------------- */

  const IS_IOS = /iPhone|iPad|iPod/.test(self.navigator.userAgent || "");

  // Only a same-origin path may be opened from a notification, whatever the payload says.
  function safePath(url) {
    return typeof url === "string" && url.charAt(0) === "/" && url.charAt(1) !== "/" && url.indexOf("\\") === -1 ? url : "/notifications";
  }

  function readPayload(event) {
    if (!event.data) return {};
    try {
      const d = event.data.json();
      return d && typeof d === "object" ? d : {};
    } catch (e) {
      try {
        return { body: event.data.text() };
      } catch (e2) {
        return {};
      }
    }
  }

  async function setBadge(count) {
    try {
      if (typeof count !== "number" || !self.navigator) return;
      if (count > 0 && self.navigator.setAppBadge) await self.navigator.setAppBadge(count);
      else if (count === 0 && self.navigator.clearAppBadge) await self.navigator.clearAppBadge();
    } catch (e) {
      /* the badge is a nicety */
    }
  }

  self.addEventListener("push", (event) => {
    const data = readPayload(event);
    event.waitUntil(
      (async () => {
        const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        // An open window refreshes its bell at once, which also plays the in-app sound and toast.
        windows.forEach((w) => w.postMessage({ type: "mps-push", id: data.id || null }));
        await setBadge(data.badge);
        // If the app is in front of the person, the toast and chime already told them: no second system notification.
        // iOS requires every push to show something (it revokes the permission otherwise), so it always does.
        if (!IS_IOS && windows.some((w) => w.focused)) return;
        const critical = data.priority === "critical";
        await self.registration.showNotification(String(data.title || "MultiPost Studio").slice(0, 120), {
          body: String(data.body || "").slice(0, 240),
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          tag: typeof data.tag === "string" ? data.tag : undefined,
          renotify: typeof data.tag === "string",
          timestamp: typeof data.ts === "number" ? data.ts : Date.now(),
          requireInteraction: critical,
          silent: false,
          vibrate: critical ? [200, 100, 200, 100, 200] : [120, 60, 120],
          data: { url: safePath(data.url), id: data.id || null },
        });
      })(),
    );
  });

  self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const url = safePath(event.notification.data && event.notification.data.url);
    event.waitUntil(
      (async () => {
        const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        const mine = windows.filter((w) => {
          try {
            return new URL(w.url).origin === self.location.origin;
          } catch (e) {
            return false;
          }
        });
        const target = mine.find((w) => w.focused) || mine[0];
        if (target) {
          try {
            await target.focus();
          } catch (e) {
            /* a window that cannot be focused is still told where to go */
          }
          // Ask the page to navigate (it keeps its state and uses the app router); fall back to navigating it directly.
          target.postMessage({ type: "mps-navigate", url });
          return;
        }
        await self.clients.openWindow(url);
      })(),
    );
  });

  // The browser replaced this device's subscription (keys rotated, push service migrated). Register the new one so
  // notifications keep arriving without the person having to open the app.
  self.addEventListener("pushsubscriptionchange", (event) => {
    event.waitUntil(
      (async () => {
        try {
          const old = event.oldSubscription;
          const sub = event.newSubscription || (old && old.options ? await self.registration.pushManager.subscribe(old.options) : null);
          if (!sub) return;
          await fetch("/api/push/subscribe", {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ subscription: sub.toJSON() }),
          });
        } catch (e) {
          /* retried the next time the app opens and re-syncs the subscription */
        }
      })(),
    );
  });
}
