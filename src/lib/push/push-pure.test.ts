import { describe, it, expect } from "vitest";
import { deviceLabel, isAllowedPushEndpoint, parsePushSubscription } from "./validate";
import { inQuietHours, localMinutes, shouldPush } from "./policy";
import { pushSupport, safeInAppPath, urlBase64ToUint8Array } from "./client";
import { buildPayload, safePushUrl } from "./send";
import { defaultSettings, parseSettings, serializeSettings } from "@/lib/notifications/prefs";

const b64url = (bytes: number[]) => Buffer.from(Uint8Array.from(bytes)).toString("base64url");
const P256 = b64url([4, ...Array.from({ length: 64 }, (_, i) => i + 1)]);
const AUTH = b64url(Array.from({ length: 16 }, (_, i) => i + 1));
const sub = (over: Record<string, unknown> = {}) => ({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: P256, auth: AUTH }, ...over });

describe("isAllowedPushEndpoint: the server only ever posts to real push services", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://web.push.apple.com/QAbc",
    "https://wns2-par02p.notify.windows.com/?token=abc",
    "https://android.googleapis.com/gcm/send/abc",
  ])("accepts %s", (u) => expect(isAllowedPushEndpoint(u)).toBe(true));

  it.each([
    ["an internal address", "https://169.254.169.254/latest/meta-data"],
    ["localhost", "https://localhost/x"],
    ["plain http", "http://fcm.googleapis.com/x"],
    ["a look-alike host", "https://fcm.googleapis.com.evil.example.com/x"],
    ["a suffix trick", "https://evilfcm.googleapis.com.example/x"],
    ["credentials in the URL", "https://user:pw@fcm.googleapis.com/x"],
    ["a custom port", "https://fcm.googleapis.com:8443/x"],
    ["a different google host", "https://www.googleapis.com/x"],
    ["not a url", "not a url"],
    ["empty", ""],
  ])("rejects %s", (_n, u) => expect(isAllowedPushEndpoint(u)).toBe(false));

  it("rejects non-strings and absurdly long values", () => {
    expect(isAllowedPushEndpoint(undefined)).toBe(false);
    expect(isAllowedPushEndpoint(42)).toBe(false);
    expect(isAllowedPushEndpoint(`https://fcm.googleapis.com/${"a".repeat(3000)}`)).toBe(false);
  });
});

describe("parsePushSubscription", () => {
  it("accepts what the browser's toJSON() produces", () => {
    expect(parsePushSubscription(sub())).toEqual({ ok: true, value: { endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: P256, auth: AUTH } });
  });

  it("rejects a bad endpoint, missing keys and keys of the wrong size or shape", () => {
    expect(parsePushSubscription(sub({ endpoint: "https://169.254.169.254/x" })).ok).toBe(false);
    expect(parsePushSubscription({ endpoint: sub().endpoint }).ok).toBe(false);
    expect(parsePushSubscription(sub({ keys: { p256dh: b64url([4, 1, 2]), auth: AUTH } })).ok).toBe(false);
    expect(parsePushSubscription(sub({ keys: { p256dh: P256, auth: b64url([1, 2, 3]) } })).ok).toBe(false);
    expect(parsePushSubscription(sub({ keys: { p256dh: b64url([5, ...Array.from({ length: 64 }, () => 1)]), auth: AUTH } })).ok).toBe(false);
    expect(parsePushSubscription(sub({ keys: { p256dh: "not base64 !!", auth: AUTH } })).ok).toBe(false);
    expect(parsePushSubscription(null).ok).toBe(false);
    expect(parsePushSubscription("x").ok).toBe(false);
  });
});

describe("deviceLabel", () => {
  it("names the browser and system from the user agent", () => {
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36")).toBe("Chrome on Android");
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1")).toBe("Safari on iPhone / iPad");
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0")).toBe("Edge on Windows");
    expect(deviceLabel("Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0")).toBe("Firefox on Linux");
    expect(deviceLabel(null)).toBe("Browser on Device");
  });
});

describe("quiet hours", () => {
  const q = { enabled: true, start: "22:00", end: "07:00" };
  const at = (iso: string) => new Date(iso);

  it("a window that crosses midnight covers the evening and the early morning", () => {
    expect(inQuietHours(at("2026-10-12T23:30:00Z"), "UTC", q)).toBe(true);
    expect(inQuietHours(at("2026-10-12T03:00:00Z"), "UTC", q)).toBe(true);
    expect(inQuietHours(at("2026-10-12T07:00:00Z"), "UTC", q)).toBe(false);
    expect(inQuietHours(at("2026-10-12T12:00:00Z"), "UTC", q)).toBe(false);
    expect(inQuietHours(at("2026-10-12T22:00:00Z"), "UTC", q)).toBe(true);
  });

  it("a same-day window works too", () => {
    expect(inQuietHours(at("2026-10-12T13:00:00Z"), "UTC", { enabled: true, start: "12:00", end: "14:00" })).toBe(true);
    expect(inQuietHours(at("2026-10-12T14:00:00Z"), "UTC", { enabled: true, start: "12:00", end: "14:00" })).toBe(false);
  });

  it("uses the person's own timezone", () => {
    // 18:30 UTC is 00:00 the next day in India (UTC+5:30): inside 22:00 to 07:00 there, outside it in UTC.
    expect(inQuietHours(at("2026-10-12T18:30:00Z"), "Asia/Kolkata", q)).toBe(true);
    expect(inQuietHours(at("2026-10-12T18:30:00Z"), "UTC", q)).toBe(false);
    expect(localMinutes(at("2026-10-12T18:30:00Z"), "Asia/Kolkata")).toBe(0);
  });

  it("an unknown or missing timezone falls back to UTC instead of failing", () => {
    expect(localMinutes(at("2026-10-12T03:00:00Z"), "Not/AZone")).toBe(180);
    expect(localMinutes(at("2026-10-12T03:00:00Z"), null)).toBe(180);
  });

  it("is off when disabled or when start equals end", () => {
    expect(inQuietHours(at("2026-10-12T23:00:00Z"), "UTC", { ...q, enabled: false })).toBe(false);
    expect(inQuietHours(at("2026-10-12T23:00:00Z"), "UTC", { enabled: true, start: "09:00", end: "09:00" })).toBe(false);
  });
});

describe("shouldPush", () => {
  const base = { type: "publish_failed", category: "publishing", priority: "high", settings: defaultSettings(), timeZone: "UTC", now: new Date("2026-10-12T12:00:00Z") } as const;

  it("pushes by default for normal and higher priorities", () => {
    expect(shouldPush({ ...base })).toBe(true);
    expect(shouldPush({ ...base, type: "publish_success", priority: "normal" })).toBe(true);
  });

  it("does not push low-priority nudges by default, though they stay in the bell", () => {
    expect(shouldPush({ ...base, type: "draft_reminder", category: "scheduling", priority: "low" })).toBe(false);
  });

  it("the master switch turns everything off, including required types the person chose to silence", () => {
    const s = { ...defaultSettings(), push: { ...defaultSettings().push, enabled: false } };
    expect(shouldPush({ ...base, settings: s })).toBe(false);
    expect(shouldPush({ ...base, settings: s, type: "billing_payment_failed", category: "billing", priority: "critical" })).toBe(false);
  });

  it("respects the category switch and the minimum priority, except for required types", () => {
    const s = defaultSettings();
    s.push.categories.publishing = false;
    expect(shouldPush({ ...base, settings: s })).toBe(false);
    s.push.minPriority = "critical";
    expect(shouldPush({ ...base, settings: defaultSettings() })).toBe(true);
    const strict = { ...defaultSettings(), push: { ...defaultSettings().push, minPriority: "critical" as const } };
    expect(shouldPush({ ...base, settings: strict })).toBe(false);
    s.push.categories.billing = false;
    expect(shouldPush({ ...base, settings: { ...strict, push: { ...strict.push, categories: { ...strict.push.categories, billing: false } } }, type: "billing_payment_failed", category: "billing", priority: "critical" })).toBe(true);
    const lowFloor = { ...defaultSettings(), push: { ...defaultSettings().push, minPriority: "critical" as const } };
    expect(shouldPush({ ...base, settings: lowFloor, type: "security_password_changed", category: "account", priority: "high" })).toBe(true);
  });

  it("holds back pushes in quiet hours but never a critical one", () => {
    const s = { ...defaultSettings(), push: { ...defaultSettings().push, quietHours: { enabled: true, start: "22:00", end: "07:00" } } };
    const night = new Date("2026-10-12T23:00:00Z");
    expect(shouldPush({ ...base, settings: s, now: night })).toBe(false);
    expect(shouldPush({ ...base, settings: s, now: night, priority: "critical", type: "account_expired", category: "account" })).toBe(true);
    expect(shouldPush({ ...base, settings: s, now: new Date("2026-10-12T12:00:00Z") })).toBe(true);
  });
});

describe("notification settings: push and sound", () => {
  it("defaults: push on for normal and above, quiet hours off, sound on at 60", () => {
    const d = defaultSettings();
    expect(d.push).toMatchObject({ enabled: true, minPriority: "normal", quietHours: { enabled: false, start: "22:00", end: "07:00" } });
    expect(Object.values(d.push.categories).every(Boolean)).toBe(true);
    expect(d.sound).toEqual({ enabled: true, volume: 60 });
  });

  it("rows saved before these settings existed read as the defaults", () => {
    expect(parseSettings(JSON.stringify({ toasts: false })).push).toEqual(defaultSettings().push);
    expect(parseSettings(JSON.stringify({ toasts: false })).sound).toEqual(defaultSettings().sound);
    expect(parseSettings(null).sound.enabled).toBe(true);
  });

  it("clamps and repairs bad values instead of failing", () => {
    const s = parseSettings(JSON.stringify({ push: { minPriority: "urgent!!", quietHours: { enabled: true, start: "25:99", end: "7am" }, categories: { billing: false } }, sound: { enabled: "yes", volume: 900 } }));
    expect(s.push.minPriority).toBe("normal");
    expect(s.push.quietHours).toEqual({ enabled: true, start: "22:00", end: "07:00" });
    expect(s.push.categories.billing).toBe(false);
    expect(s.push.categories.publishing).toBe(true);
    expect(s.sound).toEqual({ enabled: true, volume: 100 });
    expect(parseSettings(JSON.stringify({ sound: { volume: -5 } })).sound.volume).toBe(0);
  });

  it("round-trips through serialize", () => {
    const s = defaultSettings();
    s.push.minPriority = "high";
    s.push.quietHours = { enabled: true, start: "23:30", end: "06:15" };
    s.sound = { enabled: false, volume: 25 };
    expect(parseSettings(serializeSettings(s))).toEqual(s);
  });
});

describe("payloads", () => {
  it("only a path on this site can be opened from a push", () => {
    expect(safePushUrl("/composer/p1")).toBe("/composer/p1");
    for (const bad of ["//evil.example.com", "https://evil.example.com", "javascript:alert(1)", "/a\\b", null, undefined, "/" + "a".repeat(600)]) {
      expect(safePushUrl(bad as string)).toBe("/notifications");
    }
  });

  it("trims long text, tags by type and thing so repeats replace each other, and carries the unread count", () => {
    const p = buildPayload({ type: "publish_failed", title: "t".repeat(200), body: "b ".repeat(200), linkUrl: "/composer/p1", priority: "high", entityId: "p1", notificationId: "n1" }, 4, 1700000000000);
    expect(p.title.length).toBeLessThanOrEqual(80);
    expect(p.body.length).toBeLessThanOrEqual(180);
    expect(p).toMatchObject({ url: "/composer/p1", tag: "publish_failed:p1", id: "n1", priority: "high", badge: 4, ts: 1700000000000 });
  });
});

describe("browser helpers", () => {
  it("decodes the server's public key to bytes", () => {
    const bytes = urlBase64ToUint8Array(b64url([4, 255, 254, 253, 1, 2, 3]));
    expect(Array.from(bytes)).toEqual([4, 255, 254, 253, 1, 2, 3]);
  });

  it("pushSupport tells apart every situation the screen has to explain", () => {
    const ok = { hasServiceWorker: true, hasPushManager: true, hasNotification: true, permission: "default", iosBrowserTab: false };
    expect(pushSupport(ok)).toBe("default");
    expect(pushSupport({ ...ok, permission: "granted" })).toBe("granted");
    expect(pushSupport({ ...ok, permission: "denied" })).toBe("denied");
    expect(pushSupport({ ...ok, hasPushManager: false })).toBe("unsupported");
    expect(pushSupport({ ...ok, hasNotification: false })).toBe("unsupported");
    expect(pushSupport({ ...ok, iosBrowserTab: true })).toBe("needs-install");
  });

  it("safeInAppPath accepts a site path and nothing else", () => {
    expect(safeInAppPath("/inbox")).toBe("/inbox");
    expect(safeInAppPath("//x.com")).toBeNull();
    expect(safeInAppPath("https://x.com")).toBeNull();
    expect(safeInAppPath(5)).toBeNull();
  });
});
