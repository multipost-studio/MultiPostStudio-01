import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const source = fs.readFileSync(path.join(process.cwd(), "public", "sw.js"), "utf8");

type Listener = (event: unknown) => void;

/** Runs public/sw.js against a small in-memory stand-in for the service worker scope. */
type FakeWindow = { url: string; focused: boolean; focus: () => Promise<unknown>; postMessage: (m: unknown) => void };
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1";

function boot(opts: {
  hostname?: string;
  userAgent?: string;
  windows?: FakeWindow[];
  fetchImpl: (req: { url: string; method: string; mode?: string; body?: unknown }) => Promise<Response>;
}) {
  const listeners: Record<string, Listener> = {};
  const stores = new Map<string, Map<string, Response>>();
  const keyOf = (r: string | { url: string }) => (typeof r === "string" ? new URL(r, "https://app.example.com").href : r.url);
  const openCache = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      match: async (r: string | { url: string }) => store.get(keyOf(r))?.clone(),
      put: async (r: string | { url: string }, res: Response) => void store.set(keyOf(r), res),
      add: async (r: string) => {
        const res = await opts.fetchImpl({ url: keyOf(r), method: "GET" });
        if (!res.ok) throw new Error("bad response");
        store.set(keyOf(r), res);
      },
    };
  };
  const caches = {
    open: openCache,
    keys: async () => [...stores.keys()],
    delete: async (n: string) => stores.delete(n),
  };
  const self = {
    location: { hostname: opts.hostname ?? "app.example.com", origin: "https://app.example.com" },
    addEventListener: (type: string, fn: Listener) => void (listeners[type] = fn),
    skipWaiting: vi.fn(),
    navigator: { userAgent: opts.userAgent ?? ANDROID_UA, setAppBadge: vi.fn(async () => undefined), clearAppBadge: vi.fn(async () => undefined) },
    clients: { claim: vi.fn(async () => undefined), matchAll: vi.fn(async () => opts.windows ?? []), openWindow: vi.fn<(url: string) => Promise<undefined>>(async () => undefined) },
    registration: { unregister: vi.fn(async () => true), showNotification: vi.fn<(title: string, options: Record<string, unknown>) => Promise<undefined>>(async () => undefined), pushManager: { subscribe: vi.fn() } },
  };
  const context = vm.createContext({
    self,
    caches,
    fetch: (req: string | { url: string; method: string }, init?: { method?: string; body?: unknown }) =>
      opts.fetchImpl(typeof req === "string" ? { url: new URL(req, "https://app.example.com").href, method: init?.method ?? "GET", body: init?.body } : req),
    Response,
    URL,
    Set,
    Array,
    Promise,
    Boolean,
    JSON,
    Date,
    String,
    Number,
    Error,
    Math,
  });
  vm.runInContext(source, context);
  const run = async (type: string, event: Record<string, unknown>) => {
    const waits: Promise<unknown>[] = [];
    const e = { ...event, waitUntil: (p: Promise<unknown>) => void waits.push(p), respondWith: (p: Promise<Response>) => void (e.response = p) } as Record<string, unknown> & { response?: Promise<Response> };
    listeners[type]?.(e);
    await Promise.all(waits);
    return e;
  };
  return { listeners, stores, self, run };
}

const html = (body = "") => new Response(`<html><link rel="stylesheet" href="/_next/static/css/a.css"><script src="/_next/static/chunks/b.js"></script>${body}</html>`, { status: 200 });
const nav = (url: string) => ({ url: `https://app.example.com${url}`, method: "GET", mode: "navigate" });

let online: boolean;
const calls: string[] = [];
const fetchImpl = async (req: { url: string }) => {
  calls.push(req.url);
  if (!online) throw new TypeError("Failed to fetch");
  if (req.url.endsWith("/offline")) return html("OFFLINE PAGE");
  if (req.url.includes("/_next/static/") || req.url.includes("/icons/")) return new Response("asset", { status: 200 });
  return new Response("LIVE PAGE", { status: 200 });
};

beforeEach(() => {
  online = true;
  calls.length = 0;
});

describe("service worker: offline page", () => {
  it("keeps /offline and the assets it needs when it installs", async () => {
    const sw = boot({ fetchImpl });
    await sw.run("install", {});
    const names = [...sw.stores.keys()];
    expect(names).toEqual(["mps-static-v4"]);
    const keys = [...sw.stores.get(names[0])!.keys()].map((k) => new URL(k).pathname).sort();
    expect(keys).toEqual(["/_next/static/chunks/b.js", "/_next/static/css/a.css", "/offline"]);
    expect(sw.self.skipWaiting).toHaveBeenCalled();
  });

  it("still installs when the offline page cannot be fetched", async () => {
    online = false;
    const sw = boot({ fetchImpl });
    await expect(sw.run("install", {})).resolves.toBeDefined();
    expect(sw.self.skipWaiting).toHaveBeenCalled();
  });

  it("does not keep a redirect (for example to the sign-in page) as the offline page", async () => {
    const redirected = Object.defineProperty(new Response("login", { status: 200 }), "redirected", { value: true });
    const sw = boot({ fetchImpl: async () => redirected });
    await sw.run("install", {});
    expect([...(sw.stores.get("mps-static-v4")?.keys() ?? [])]).toEqual([]);
  });

  it("a page load goes to the network first and is returned as is while online", async () => {
    const sw = boot({ fetchImpl });
    await sw.run("install", {});
    calls.length = 0;
    const e = await sw.run("fetch", { request: nav("/dashboard") });
    expect(await (await e.response!).text()).toBe("LIVE PAGE");
    expect(calls).toEqual(["https://app.example.com/dashboard"]);
  });

  it("shows the offline page when a page load cannot reach the server at all", async () => {
    const sw = boot({ fetchImpl });
    await sw.run("install", {});
    online = false;
    const e = await sw.run("fetch", { request: nav("/dashboard") });
    expect(await (await e.response!).text()).toContain("OFFLINE PAGE");
  });

  it("never replaces a server error with the offline page: a 500 reaches the person as a 500", async () => {
    const sw = boot({ fetchImpl: async (req) => (req.url.endsWith("/offline") ? html("OFFLINE PAGE") : new Response("boom", { status: 500 })) });
    await sw.run("install", {});
    const e = await sw.run("fetch", { request: nav("/dashboard") });
    const res = await e.response!;
    expect(res.status).toBe(500);
  });

  it("with no stored offline page it fails like the browser would, not with a made-up page", async () => {
    online = false;
    const sw = boot({ fetchImpl });
    await sw.run("install", {});
    const e = await sw.run("fetch", { request: nav("/dashboard") });
    expect((await e.response!).type).toBe("error");
  });
});

describe("service worker: everything else is left alone", () => {
  it("does not touch API calls, other methods or cross-origin requests", async () => {
    const sw = boot({ fetchImpl });
    await sw.run("install", {});
    for (const request of [
      { url: "https://app.example.com/api/notifications", method: "GET", mode: "cors" },
      { url: "https://app.example.com/dashboard", method: "POST", mode: "same-origin" },
      { url: "https://cdn.example.com/x.js", method: "GET", mode: "no-cors" },
    ]) {
      const e = await sw.run("fetch", { request });
      expect(e.response).toBeUndefined();
    }
  });

  it("still serves build assets and icons from the cache", async () => {
    const sw = boot({ fetchImpl });
    await sw.run("install", {});
    await sw.run("activate", {});
    const first = await sw.run("fetch", { request: { url: "https://app.example.com/icons/icon-192.png", method: "GET", mode: "no-cors" } });
    expect(await (await first.response!).text()).toBe("asset");
    online = false;
    const again = await sw.run("fetch", { request: { url: "https://app.example.com/icons/icon-192.png", method: "GET", mode: "no-cors" } });
    expect((await again.response!).ok).toBe(true);
  });

  it("removes caches from older versions when it activates", async () => {
    const sw = boot({ fetchImpl });
    await sw.stores.set("mps-static-v3", new Map());
    await sw.run("install", {});
    await sw.run("activate", {});
    expect([...sw.stores.keys()]).toEqual(["mps-static-v4"]);
    expect(sw.self.clients.claim).toHaveBeenCalled();
  });

  it("on localhost it clears caches and unregisters instead of caching anything", async () => {
    const sw = boot({ hostname: "localhost", fetchImpl });
    await sw.run("activate", {});
    expect(sw.self.registration.unregister).toHaveBeenCalled();
    expect(sw.listeners.fetch).toBeUndefined();
  });
});

const windowAt = (url: string, focused = false) => {
  const posted: unknown[] = [];
  const w = { url, focused, focus: vi.fn(async () => undefined), postMessage: (m: unknown) => void posted.push(m) };
  return { w, posted };
};
const pushEvent = (data: unknown) => ({ data: { json: () => data, text: () => String(data) } });
const payload = { title: "Published to Instagram", body: '"Launch" is live.', url: "/composer/p1", tag: "publish_success:p1", id: "n1", priority: "normal", badge: 3, ts: 1700000000000 };

describe("service worker: push notifications", () => {
  it("shows the notification with its text, link and an app badge when no window is in front", async () => {
    const sw = boot({ fetchImpl, windows: [] });
    await sw.run("push", { ...pushEvent(payload) });
    const [title, options] = sw.self.registration.showNotification.mock.calls[0] as [string, Record<string, unknown>];
    expect(title).toBe("Published to Instagram");
    expect(options).toMatchObject({ body: '"Launch" is live.', tag: "publish_success:p1", renotify: true, silent: false, requireInteraction: false, data: { url: "/composer/p1", id: "n1" } });
    expect(sw.self.navigator.setAppBadge).toHaveBeenCalledWith(3);
  });

  it("tells open windows at once so they refresh their bell (sound and toast)", async () => {
    const a = windowAt("https://app.example.com/dashboard", false);
    const sw = boot({ fetchImpl, windows: [a.w] });
    await sw.run("push", { ...pushEvent(payload) });
    expect(a.posted).toEqual([{ type: "mps-push", id: "n1" }]);
  });

  it("does not add a second system notification while the app is in front (not on iOS)", async () => {
    const a = windowAt("https://app.example.com/dashboard", true);
    const sw = boot({ fetchImpl, windows: [a.w] });
    await sw.run("push", { ...pushEvent(payload) });
    expect(sw.self.registration.showNotification).not.toHaveBeenCalled();
    expect(a.posted.length).toBe(1);
  });

  it("on iOS always shows it, because iOS withdraws the permission from sites that receive a push and show nothing", async () => {
    const a = windowAt("https://app.example.com/dashboard", true);
    const sw = boot({ fetchImpl, windows: [a.w], userAgent: IPHONE_UA });
    await sw.run("push", { ...pushEvent(payload) });
    expect(sw.self.registration.showNotification).toHaveBeenCalledOnce();
  });

  it("a critical alert stays on screen until dismissed and vibrates longer", async () => {
    const sw = boot({ fetchImpl });
    await sw.run("push", { ...pushEvent({ ...payload, priority: "critical" }) });
    const options = sw.self.registration.showNotification.mock.calls[0][1] as { requireInteraction: boolean; vibrate: number[] };
    expect(options.requireInteraction).toBe(true);
    expect(options.vibrate.length).toBeGreaterThan(2);
  });

  it("clears the badge when nothing is unread", async () => {
    const sw = boot({ fetchImpl });
    await sw.run("push", { ...pushEvent({ ...payload, badge: 0 }) });
    expect(sw.self.navigator.clearAppBadge).toHaveBeenCalled();
    expect(sw.self.navigator.setAppBadge).not.toHaveBeenCalled();
  });

  it("copes with an empty or unreadable payload by showing a plain notification", async () => {
    const sw = boot({ fetchImpl });
    await sw.run("push", { data: null });
    expect(sw.self.registration.showNotification.mock.calls[0][0]).toBe("MultiPost Studio");
    const sw2 = boot({ fetchImpl });
    await sw2.run("push", { data: { json: () => { throw new Error("not json"); }, text: () => "plain words" } });
    expect((sw2.self.registration.showNotification.mock.calls[0][1] as { body: string }).body).toBe("plain words");
  });

  it("never opens anything but a path on this site, whatever the payload carries", async () => {
    for (const url of ["//evil.example.com/x", "https://evil.example.com", "javascript:alert(1)", "/ok\\..\\x", 42, undefined]) {
      const sw = boot({ fetchImpl });
      await sw.run("push", { ...pushEvent({ ...payload, url }) });
      expect((sw.self.registration.showNotification.mock.calls[0][1] as { data: { url: string } }).data.url).toBe("/notifications");
    }
  });
});

describe("service worker: tapping a notification", () => {
  const click = (url: unknown) => ({ notification: { close: vi.fn(), data: { url } } });

  it("brings an open window forward and sends it to the right page", async () => {
    const a = windowAt("https://app.example.com/calendar", true);
    const sw = boot({ fetchImpl, windows: [a.w] });
    const event = click("/composer/p1");
    await sw.run("notificationclick", event);
    expect(event.notification.close).toHaveBeenCalled();
    expect(a.w.focus).toHaveBeenCalled();
    expect(a.posted).toEqual([{ type: "mps-navigate", url: "/composer/p1" }]);
    expect(sw.self.clients.openWindow).not.toHaveBeenCalled();
  });

  it("opens the app when no window is open", async () => {
    const sw = boot({ fetchImpl, windows: [] });
    await sw.run("notificationclick", click("/inbox"));
    expect(sw.self.clients.openWindow).toHaveBeenCalledWith("/inbox");
  });

  it("ignores windows of other sites and refuses an unsafe target", async () => {
    const other = windowAt("https://elsewhere.example.com/", true);
    const sw = boot({ fetchImpl, windows: [other.w] });
    await sw.run("notificationclick", click("//evil.example.com"));
    expect(other.w.focus).not.toHaveBeenCalled();
    expect(sw.self.clients.openWindow).toHaveBeenCalledWith("/notifications");
  });
});

describe("service worker: subscription changes", () => {
  it("registers the replacement subscription with the server", async () => {
    const seen: { url: string; method: string; body?: unknown }[] = [];
    const sw = boot({
      fetchImpl: async (req) => {
        seen.push(req);
        return new Response("{}", { status: 200 });
      },
    });
    const newSub = { toJSON: () => ({ endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "k", auth: "a" } }) };
    await sw.run("pushsubscriptionchange", { newSubscription: newSub });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ url: "https://app.example.com/api/push/subscribe", method: "POST" });
    expect(JSON.parse(String(seen[0].body))).toEqual({ subscription: { endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "k", auth: "a" } } });
  });

  it("subscribes again with the old options when the browser gives no new subscription, and never throws if the server is down", async () => {
    const sw = boot({ fetchImpl: async () => { throw new TypeError("offline"); } });
    sw.self.registration.pushManager.subscribe.mockResolvedValue({ toJSON: () => ({ endpoint: "https://fcm.googleapis.com/y", keys: {} }) });
    await expect(sw.run("pushsubscriptionchange", { oldSubscription: { options: { userVisibleOnly: true, applicationServerKey: new Uint8Array(1) } } })).resolves.toBeDefined();
    expect(sw.self.registration.pushManager.subscribe).toHaveBeenCalled();
  });
});
