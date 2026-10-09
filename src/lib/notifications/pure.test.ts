import { describe, expect, it, vi } from "vitest";
import {
  CATEGORIES,
  NOTIFICATION_TYPES,
  PRIORITIES,
  categoryOf,
  defaultPriorityOf,
  getTypeDef,
  isMentionType,
  isRequiredType,
  joinPlatforms,
  platformName,
} from "./types";
import { safeActionUrl } from "./links";
import { defaultSettings, parseSettings, serializeSettings, shouldDeliverInApp } from "./prefs";
import { buildPublishNotification, classifyFailure, friendlyReason } from "./publish";
import { highestThreshold, humanizeMinutes, isoWeekKey, localParts, pickReminderOffset } from "./reminders";

// reminders.ts pulls in the database and logger at import time; the helpers under test are pure.
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/env", () => ({ flags: { realEmail: false } }));
vi.mock("@/lib/adapters/email", () => ({ sendNotificationEmail: vi.fn() }));

describe("type registry", () => {
  it("has unique ids and valid categories and priorities", () => {
    const ids = NOTIFICATION_TYPES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of NOTIFICATION_TYPES) {
      expect(CATEGORIES).toContain(t.category);
      expect(PRIORITIES).toContain(t.priority);
      expect(t.label.length).toBeGreaterThan(2);
    }
  });

  it("keeps the ids older rows were stored with", () => {
    for (const legacy of ["publish_success", "publish_failed", "approval_request", "mention", "streak_milestone", "system"]) {
      expect(getTypeDef(legacy), legacy).toBeDefined();
    }
  });

  it("files unknown and legacy free-form types sensibly", () => {
    expect(categoryOf("approval_something_new")).toBe("team");
    expect(categoryOf("publish_whatever")).toBe("publishing");
    expect(categoryOf("totally_unknown")).toBe("system");
    expect(defaultPriorityOf("totally_unknown")).toBe("normal");
  });

  it("marks payment, security and dead-connection alerts as required, and ordinary ones not", () => {
    for (const id of ["billing_payment_failed", "security_password_changed", "security_two_factor", "account_expired", "billing_canceled"]) {
      expect(isRequiredType(id), id).toBe(true);
    }
    for (const id of ["publish_success", "draft_reminder", "calendar_gap", "mention"]) expect(isRequiredType(id), id).toBe(false);
  });

  it("treats mentions and comments as the Mentions tab", () => {
    expect(isMentionType("mention")).toBe(true);
    expect(isMentionType("comment")).toBe(true);
    expect(isMentionType("publish_failed")).toBe(false);
  });

  it("names platforms in plain language", () => {
    expect(platformName("x")).toBe("X");
    expect(platformName("gbp")).toBe("Google Business Profile");
    expect(platformName("mastodon")).toBe("Mastodon");
    expect(joinPlatforms(["instagram", "x", "linkedin", "x"])).toBe("Instagram, X and LinkedIn");
    expect(joinPlatforms(["instagram"])).toBe("Instagram");
    expect(joinPlatforms([])).toBe("");
  });
});

describe("safeActionUrl", () => {
  it("allows internal paths", () => {
    expect(safeActionUrl("/composer/abc")).toBe("/composer/abc");
    expect(safeActionUrl("  /settings/billing?plan=pro  ")).toBe("/settings/billing?plan=pro");
  });

  it.each([
    "https://evil.example/phish",
    "http://evil.example",
    "//evil.example",
    "javascript:alert(1)",
    "data:text/html,<script>",
    "/\\evil.example",
    "composer/abc",
    "",
    "/ok\nSet-Cookie: x=1",
    "/" + "a".repeat(600),
  ])("rejects %j", (bad) => {
    expect(safeActionUrl(bad)).toBeNull();
  });

  it("lets announcements (and only those) carry a plain https link", () => {
    const ok = { allowExternalHttps: true };
    expect(safeActionUrl("https://blog.multipoststudio.online/launch", ok)).toBe("https://blog.multipoststudio.online/launch");
    expect(safeActionUrl("https://blog.multipoststudio.online/launch")).toBeNull();
    for (const bad of ["http://example.com/x", "javascript:alert(1)", "https://user:pw@example.com/x", "https://localhost/x", "data:text/html,x", "https:// spaced.example"]) {
      expect(safeActionUrl(bad, ok), bad).toBeNull();
    }
  });

  it("rejects non-strings", () => {
    expect(safeActionUrl(null)).toBeNull();
    expect(safeActionUrl(undefined)).toBeNull();
    expect(safeActionUrl(42 as unknown as string)).toBeNull();
  });
});

describe("notification settings", () => {
  it("gives full defaults for nothing, garbage and empty objects", () => {
    const d = defaultSettings();
    expect(parseSettings(null)).toEqual(d);
    expect(parseSettings("")).toEqual(d);
    expect(parseSettings("not json")).toEqual(d);
    expect(parseSettings("[]")).toEqual(d);
    expect(parseSettings("{}")).toEqual(d);
  });

  it("defaults are conservative: opt-in nudges are off, failures-relevant reminders on", () => {
    const d = defaultSettings();
    expect(d.postingReminder.enabled).toBe(false);
    expect(d.calendarGap.enabled).toBe(false);
    expect(d.scheduledReminders.enabled).toBe(true);
    expect(d.scheduledReminders.offsets).toEqual([60]);
  });

  it("clamps numbers and drops unknown reminder offsets and milestones", () => {
    const s = parseSettings(
      JSON.stringify({
        draftReminders: { enabled: true, afterDays: 9999 },
        calendarGap: { enabled: true, daysAhead: -4 },
        postingReminder: { enabled: true, afterDays: "7", hour: 99 },
        scheduledReminders: { enabled: true, offsets: [1440, 7, 15, "x"] },
        milestones: { enabled: true, thresholds: [100, 3, 10000] },
      }),
    );
    expect(s.draftReminders.afterDays).toBe(30);
    expect(s.calendarGap.daysAhead).toBe(1);
    expect(s.postingReminder).toEqual({ enabled: true, afterDays: 7, hour: 23 });
    expect(s.scheduledReminders.offsets).toEqual([1440, 15]);
    expect(s.milestones.thresholds).toEqual([100, 10000]);
  });

  it("round-trips", () => {
    const s = { ...defaultSettings(), toasts: false, publishSuccess: false };
    expect(parseSettings(serializeSettings(s))).toEqual(s);
  });

  it("serialises in a stable shape the opt-in lookups can match", () => {
    const on = { ...defaultSettings(), calendarGap: { enabled: true, daysAhead: 3 } };
    expect(serializeSettings(on)).toContain('"calendarGap":{"enabled":true');
    expect(serializeSettings({ ...defaultSettings(), postingReminder: { enabled: true, afterDays: 3, hour: 9 } })).toContain('"postingReminder":{"enabled":true');
  });

  describe("shouldDeliverInApp", () => {
    it("delivers by default", () => {
      expect(shouldDeliverInApp("publish_failed", defaultSettings(), true)).toBe(true);
    });

    it("master switch off blocks ordinary notifications", () => {
      expect(shouldDeliverInApp("publish_failed", defaultSettings(), false)).toBe(false);
    });

    it("required alerts get through the master switch and a category switch", () => {
      const off = { ...defaultSettings(), categories: { ...defaultSettings().categories, billing: false, account: false } };
      expect(shouldDeliverInApp("billing_payment_failed", off, false)).toBe(true);
      expect(shouldDeliverInApp("security_password_changed", off, false)).toBe(true);
      expect(shouldDeliverInApp("account_expired", off, false)).toBe(true);
      // ...but optional ones in those categories do not
      expect(shouldDeliverInApp("billing_plan_changed", off, true)).toBe(false);
      expect(shouldDeliverInApp("account_expiring", off, true)).toBe(false);
    });

    it("a category switch blocks only that category", () => {
      const s = { ...defaultSettings(), categories: { ...defaultSettings().categories, scheduling: false } };
      expect(shouldDeliverInApp("post_reminder", s, true)).toBe(false);
      expect(shouldDeliverInApp("publish_failed", s, true)).toBe(true);
    });

    it("can silence success confirmations without silencing failures", () => {
      const s = { ...defaultSettings(), publishSuccess: false };
      expect(shouldDeliverInApp("publish_success", s, true)).toBe(false);
      expect(shouldDeliverInApp("publish_failed", s, true)).toBe(true);
      expect(shouldDeliverInApp("publish_partial", s, true)).toBe(true);
    });
  });
});

describe("publish notifications", () => {
  it("classifies the fix a failure needs", () => {
    expect(classifyFailure("Instagram isn't connected with real credentials. Reconnect it")).toBe("reconnect");
    expect(classifyFailure("Your access token expired")).toBe("reconnect");
    expect(classifyFailure("Caption is too long for X (300 characters max)")).toBe("content");
    expect(classifyFailure("Video aspect ratio isn't supported")).toBe("content");
    expect(classifyFailure("Rate limited, try again soon")).toBe("retry");
    expect(classifyFailure(null)).toBe("retry");
  });

  it("never lets a stack trace, JSON dump or raw URL reach the customer", () => {
    const dumps = [
      '{"error":{"message":"(#190) bad token","code":190}}',
      "TypeError: x is undefined\n    at publish (/app/.next/server/chunks/a.js:10:5)",
      "Request to https://graph.facebook.com/v19?access_token=abc failed",
      "connect ECONNRESET 10.0.0.1",
    ];
    for (const d of dumps) {
      const r = friendlyReason(d);
      expect(r).not.toMatch(/[{}]|at publish|access_token|ECONN/);
      expect(r.length).toBeLessThan(120);
    }
    expect(friendlyReason("")).toBe("The platform did not accept it.");
    expect(friendlyReason("x".repeat(500)).length).toBeLessThanOrEqual(160);
  });

  it("summarises a fully successful multi-platform post as ONE notification", () => {
    const n = buildPublishNotification({
      postId: "p1",
      postTitle: "Launch day",
      channels: [
        { platform: "instagram", status: "published" },
        { platform: "x", status: "published" },
        { platform: "linkedin", status: "published" },
      ],
    });
    expect(n.type).toBe("publish_success");
    expect(n.title).toBe("Published to 3 channels");
    expect(n.body).toContain("Instagram, X and LinkedIn");
    expect(n.priority).toBe("normal");
    expect(n.linkUrl).toBe("/composer/p1");
  });

  it("describes a partial failure with the reason and the right action", () => {
    const n = buildPublishNotification({
      postId: "p1",
      postTitle: "Launch day",
      channels: [
        { platform: "instagram", status: "published" },
        { platform: "x", status: "failed", error: "Caption is too long for X" },
      ],
    });
    expect(n.type).toBe("publish_partial");
    expect(n.priority).toBe("high");
    expect(n.actionLabel).toBe("Edit post");
    expect(n.body).toContain("went live on Instagram");
    expect(n.body).toContain("not on X");
    expect(n.body).toContain("Caption is too long");
    expect(n.platform).toBe("x");
  });

  it("sends a dead connection to Integrations, not to the post", () => {
    const n = buildPublishNotification({
      postId: "p1",
      postTitle: null,
      channels: [{ platform: "instagram", status: "failed", error: "Instagram isn't connected. Reconnect it from Integrations" }],
    });
    expect(n.type).toBe("publish_failed");
    expect(n.actionLabel).toBe("Reconnect");
    expect(n.linkUrl).toBe("/integrations");
    expect(n.body).toContain("Untitled post");
    expect(n.metadata.failureKind).toBe("reconnect");
    expect(JSON.stringify(n.metadata.actions)).toContain("/composer/p1");
  });

  it("offers a Retry on transient failures and truncates long titles", () => {
    const n = buildPublishNotification({
      postId: "p1",
      postTitle: "T".repeat(200),
      channels: [
        { platform: "x", status: "failed", error: "Rate limited" },
        { platform: "threads", status: "failed", error: "Rate limited" },
      ],
    });
    expect(n.title).toBe("Publishing failed on 2 channels");
    expect(n.actionLabel).toBe("Retry");
    expect(n.body.length).toBeLessThan(260);
    expect(n.body).toContain("X and Threads");
  });
});

describe("reminder helpers", () => {
  it("picks the closest reminder the post is already inside", () => {
    expect(pickReminderOffset(1300, [1440, 60, 15])).toBe(1440);
    expect(pickReminderOffset(59, [1440, 60, 15])).toBe(60);
    expect(pickReminderOffset(14, [1440, 60, 15])).toBe(15);
    expect(pickReminderOffset(14, [60])).toBe(60);
  });

  it("does not remind about a post that is more distant than every chosen offset, or already past", () => {
    expect(pickReminderOffset(120, [60, 15])).toBeNull();
    expect(pickReminderOffset(0, [60])).toBeNull();
    expect(pickReminderOffset(-5, [60])).toBeNull();
    expect(pickReminderOffset(30, [])).toBeNull();
  });

  it("humanizes minutes", () => {
    expect(humanizeMinutes(0.4)).toBe("less than a minute");
    expect(humanizeMinutes(1)).toBe("1 minute");
    expect(humanizeMinutes(14.6)).toBe("15 minutes");
    expect(humanizeMinutes(60)).toBe("1 hour");
    expect(humanizeMinutes(180)).toBe("3 hours");
  });

  it("reads the local hour in the person's own timezone, falling back to UTC", () => {
    const at = new Date("2026-10-08T23:30:00Z");
    expect(localParts(at, "UTC")).toEqual({ hour: 23, date: "2026-10-08" });
    expect(localParts(at, "Asia/Kolkata")).toEqual({ hour: 5, date: "2026-10-09" });
    expect(localParts(at, "America/New_York")).toEqual({ hour: 19, date: "2026-10-08" });
    expect(localParts(at, "Not/AZone")).toEqual({ hour: 23, date: "2026-10-08" });
  });

  it("buckets by ISO week", () => {
    expect(isoWeekKey(new Date("2026-10-08T12:00:00Z"))).toBe("2026-W41");
    expect(isoWeekKey(new Date("2026-10-11T12:00:00Z"))).toBe("2026-W41");
    expect(isoWeekKey(new Date("2026-10-12T00:00:00Z"))).toBe("2026-W42");
    expect(isoWeekKey(new Date("2026-01-01T00:00:00Z"))).toBe("2026-W01");
  });

  it("finds the highest milestone reached", () => {
    expect(highestThreshold(99, [100, 500])).toBeNull();
    expect(highestThreshold(100, [100, 500])).toBe(100);
    expect(highestThreshold(750, [100, 500, 1000])).toBe(500);
    expect(highestThreshold(5000, [])).toBeNull();
  });
});
