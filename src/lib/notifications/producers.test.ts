import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db: { postChannel: { findMany: vi.fn() } } }));

const svc = vi.hoisted(() => ({ createNotification: vi.fn(), createForWorkspace: vi.fn(), createForOrgAdmins: vi.fn() }));
vi.mock("./service", () => svc);

import { db } from "@/lib/db";
import { notifyPaymentFailed, notifyPlanChanged, notifySubscriptionCanceled } from "./billing-notify";
import { notifySecurityEvent } from "./security-notify";
import { notifyPublishResult } from "./publish-notify";

beforeEach(() => {
  vi.clearAllMocks();
  svc.createNotification.mockResolvedValue({ created: true, id: "n" });
  svc.createForWorkspace.mockResolvedValue({ created: 2 });
  svc.createForOrgAdmins.mockResolvedValue({ created: 1 });
});

describe("billing notifications", () => {
  it("payment failure goes to the org's owners, keyed on the charge so a redelivered webhook says it once", async () => {
    await notifyPaymentFailed("org1", "INV-001");
    await notifyPaymentFailed("org1", "INV-001");
    const [orgId, arg] = svc.createForOrgAdmins.mock.calls[0];
    expect(orgId).toBe("org1");
    expect(arg).toMatchObject({ type: "billing_payment_failed", linkUrl: "/settings/billing", actionLabel: "Update payment", dedupeKey: "billing_payment_failed:org1:INV-001" });
    expect(svc.createForOrgAdmins.mock.calls[1][1].dedupeKey).toBe(arg.dedupeKey);
    expect(notifyPaymentFailed("org1", "INV-002")).resolves.toBeDefined();
    expect(svc.createForOrgAdmins.mock.calls[2][1].dedupeKey).not.toBe(arg.dedupeKey);
  });

  it("plan change reads naturally for a new subscription and for a change", async () => {
    const renewsOn = new Date("2026-11-08T00:00:00Z");
    await notifyPlanChanged("org1", { planName: "Pro", interval: "year", renewsOn, isNew: true });
    await notifyPlanChanged("org1", { planName: "Business", interval: "month", renewsOn, isNew: false });
    expect(svc.createForOrgAdmins.mock.calls[0][1]).toMatchObject({ title: "Welcome to Pro", dedupeKey: "billing_plan_changed:org1:Pro:year:2026-11-08" });
    expect(String(svc.createForOrgAdmins.mock.calls[0][1].body)).toContain("billed yearly");
    expect(svc.createForOrgAdmins.mock.calls[1][1].title).toBe("Plan updated to Business");
  });

  it("cancellation says whether access continues", async () => {
    const accessUntil = new Date("2026-11-08T00:00:00Z");
    await notifySubscriptionCanceled("org1", { accessUntil, endedNow: false });
    await notifySubscriptionCanceled("org1", { accessUntil, endedNow: true });
    expect(String(svc.createForOrgAdmins.mock.calls[0][1].body)).toContain("8 Nov 2026");
    expect(svc.createForOrgAdmins.mock.calls[1][1].title).toBe("Your subscription has ended");
    expect(svc.createForOrgAdmins.mock.calls[0][1].dedupeKey).not.toBe(svc.createForOrgAdmins.mock.calls[1][1].dedupeKey);
  });
});

describe("security notifications", () => {
  it("a password change is critical-typed, links to security settings and carries no secrets", async () => {
    await notifySecurityEvent("u1", "password_changed", new Date("2026-10-08T10:15:30Z"));
    const arg = svc.createNotification.mock.calls[0][0];
    expect(arg).toMatchObject({ userId: "u1", type: "security_password_changed", linkUrl: "/settings/security", dedupeKey: "security:password_changed:u1:2026-10-08T10:15" });
    expect(JSON.stringify(arg)).not.toMatch(/hash|secret|token/i);
  });

  it("each event has its own wording", async () => {
    for (const e of ["password_reset", "two_factor_enabled", "two_factor_disabled"] as const) await notifySecurityEvent("u1", e);
    const titles = svc.createNotification.mock.calls.map((c) => c[0].title);
    expect(new Set(titles).size).toBe(3);
    expect(svc.createNotification.mock.calls.map((c) => c[0].type)).toEqual(["security_password_changed", "security_two_factor", "security_two_factor"]);
  });
});

describe("publish result notifications", () => {
  const post = { id: "p1", title: "Launch", workspaceId: "w1" };

  it("sends ONE grouped notification for a post, read back from the channel rows", async () => {
    vi.mocked(db.postChannel.findMany).mockResolvedValue([
      { platform: "instagram", status: "published", error: null },
      { platform: "x", status: "published", error: null },
    ] as never);
    await notifyPublishResult({ jobId: "job1", post });
    expect(svc.createForWorkspace).toHaveBeenCalledOnce();
    expect(svc.createForWorkspace.mock.calls[0][0]).toBe("w1");
    expect(svc.createForWorkspace.mock.calls[0][1]).toMatchObject({ type: "publish_success", title: "Published to 2 channels", dedupeKey: "publish:job1", entityType: "post", entityId: "p1" });
    expect(svc.createForWorkspace.mock.calls[0][1].group).toBeUndefined();
  });

  it("folds repeated reconnect failures for one platform into a single entry", async () => {
    vi.mocked(db.postChannel.findMany).mockResolvedValue([{ platform: "instagram", status: "failed", error: "Instagram isn't connected. Reconnect it from Integrations" }] as never);
    await notifyPublishResult({ jobId: "job2", post });
    const arg = svc.createForWorkspace.mock.calls[0][1];
    expect(arg).toMatchObject({ type: "publish_failed", entityType: "publish_account", entityId: "w1:instagram", linkUrl: "/integrations", actionLabel: "Reconnect" });
    expect(arg.group.windowMin).toBe(60);
    expect(arg.group.merge(4)).toMatchObject({ title: "4 posts could not be published to Instagram", linkUrl: "/integrations", actionLabel: "Reconnect" });
  });

  it("does not fold content problems: each post needs its own fix", async () => {
    vi.mocked(db.postChannel.findMany).mockResolvedValue([{ platform: "x", status: "failed", error: "Caption is too long for X" }] as never);
    await notifyPublishResult({ jobId: "job3", post });
    expect(svc.createForWorkspace.mock.calls[0][1].group).toBeUndefined();
    expect(svc.createForWorkspace.mock.calls[0][1]).toMatchObject({ actionLabel: "Edit post", entityType: "post" });
  });

  it("says nothing when no channel reached a final state, and never throws", async () => {
    vi.mocked(db.postChannel.findMany).mockResolvedValue([] as never);
    await notifyPublishResult({ jobId: "job4", post });
    expect(svc.createForWorkspace).not.toHaveBeenCalled();
    vi.mocked(db.postChannel.findMany).mockRejectedValue(new Error("db"));
    await expect(notifyPublishResult({ jobId: "job5", post })).resolves.toBeUndefined();
  });

  it("never exposes a raw provider error in the message", async () => {
    vi.mocked(db.postChannel.findMany).mockResolvedValue([{ platform: "facebook", status: "failed", error: '{"error":{"message":"(#190) token","fbtrace_id":"AbC"}}' }] as never);
    await notifyPublishResult({ jobId: "job6", post });
    expect(JSON.stringify(svc.createForWorkspace.mock.calls[0][1])).not.toMatch(/fbtrace|#190|\{"error"/);
  });
});
