import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const source = fs.readFileSync(path.join(process.cwd(), "public", "sw.js"), "utf8");

type Listener = (event: unknown) => void;

/** Runs public/sw.js against a small in-memory stand-in for the service worker scope. */
function boot(opts: { hostname?: string; fetchImpl: (req: { url: string; method: string; mode?: string }) => Promise<Response> }) {
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
    clients: { claim: vi.fn(async () => undefined) },
    registration: { unregister: vi.fn(async () => true) },
  };
  const context = vm.createContext({
    self,
    caches,
    fetch: (req: string | { url: string; method: string }) =>
      opts.fetchImpl(typeof req === "string" ? { url: new URL(req, "https://app.example.com").href, method: "GET" } : req),
    Response,
    URL,
    Set,
    Array,
    Promise,
    Boolean,
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
