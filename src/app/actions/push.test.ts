import { describe, it, expect, vi, beforeEach } from "vitest";
import { savePushSubscriptionAction, removePushSubscriptionAction, removePushDeviceAction, sendTestPushAction } from "./push";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { registerSubscription } from "@/lib/push/store";
import { sendTestPush } from "@/lib/push/send";
import { IMPERSONATION_BLOCKED_MESSAGE } from "@/lib/impersonation";

let configured = true;

vi.mock("@/lib/env", () => ({
  flags: {
    get webPush() {
      return configured;
    },
  },
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ "user-agent": "Mozilla/5.0 (Linux; Android 14) Chrome/126" })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: vi.fn(),
  RateLimitError: class RateLimitError extends Error {},
}));
vi.mock("@/lib/push/store", () => ({ registerSubscription: vi.fn() }));
vi.mock("@/lib/push/send", () => ({ sendTestPush: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { pushSubscription: { deleteMany: vi.fn() } } }));

const b64 = (bytes: number[]) => Buffer.from(Uint8Array.from(bytes)).toString("base64url");
const goodSub = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  keys: { p256dh: b64([4, ...Array.from({ length: 64 }, (_, i) => i + 1)]), auth: b64(Array.from({ length: 16 }, (_, i) => i + 1)) },
};

beforeEach(() => {
  configured = true;
  vi.mocked(requireUser).mockReset().mockResolvedValue({ id: "u1", isImpersonated: false } as never);
  vi.mocked(enforceRateLimit).mockReset().mockResolvedValue(undefined as never);
  vi.mocked(registerSubscription).mockReset().mockResolvedValue({ id: "row1" });
  vi.mocked(sendTestPush).mockReset();
  vi.mocked(db.pushSubscription.deleteMany).mockReset().mockResolvedValue({ count: 1 } as never);
});

describe("savePushSubscriptionAction", () => {
  it("saves a valid subscription for the signed-in user, with the browser's user agent for the device label", async () => {
    const res = await savePushSubscriptionAction(goodSub);
    expect(res.ok).toBe(true);
    expect(registerSubscription).toHaveBeenCalledWith("u1", expect.objectContaining({ endpoint: goodSub.endpoint }), expect.stringContaining("Android"), undefined);
  });

  it("refuses an endpoint that is not a real push service, saving nothing", async () => {
    const res = await savePushSubscriptionAction({ ...goodSub, endpoint: "https://169.254.169.254/latest" });
    expect(res.ok).toBe(false);
    expect(registerSubscription).not.toHaveBeenCalled();
  });

  it("refuses garbage and bad keys", async () => {
    expect((await savePushSubscriptionAction(null)).ok).toBe(false);
    expect((await savePushSubscriptionAction({ ...goodSub, keys: { p256dh: "x", auth: "y" } })).ok).toBe(false);
    expect(registerSubscription).not.toHaveBeenCalled();
  });

  it("says so when the server has no push keys, and does nothing", async () => {
    configured = false;
    const res = await savePushSubscriptionAction(goodSub);
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/aren't set up/) });
    expect(registerSubscription).not.toHaveBeenCalled();
  });

  it("is rate limited", async () => {
    vi.mocked(enforceRateLimit).mockRejectedValue(new RateLimitError(60));
    expect((await savePushSubscriptionAction(goodSub)).ok).toBe(false);
    expect(registerSubscription).not.toHaveBeenCalled();
  });

  it("an administrator viewing as a customer cannot turn on pushes for that customer", async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: "customer", isImpersonated: true } as never);
    expect(await savePushSubscriptionAction(goodSub)).toEqual({ ok: false, error: IMPERSONATION_BLOCKED_MESSAGE });
    expect(registerSubscription).not.toHaveBeenCalled();
  });
});

describe("removing devices", () => {
  it("removePushSubscriptionAction only removes the signed-in user's own endpoint", async () => {
    await removePushSubscriptionAction("https://fcm.googleapis.com/x");
    expect(db.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1", endpoint: "https://fcm.googleapis.com/x" } });
  });

  it("removePushDeviceAction only removes a device that belongs to the user, and says if it was not found", async () => {
    expect((await removePushDeviceAction("row1")).ok).toBe(true);
    expect(db.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1", id: "row1" } });
    vi.mocked(db.pushSubscription.deleteMany).mockResolvedValue({ count: 0 } as never);
    expect((await removePushDeviceAction("someone-elses")).ok).toBe(false);
  });

  it("rejects missing or oversized ids, and is blocked while viewing as a customer", async () => {
    expect((await removePushDeviceAction("")).ok).toBe(false);
    expect((await removePushSubscriptionAction("x".repeat(3000))).ok).toBe(false);
    vi.mocked(requireUser).mockResolvedValue({ id: "customer", isImpersonated: true } as never);
    expect((await removePushDeviceAction("row1")).ok).toBe(false);
    expect(db.pushSubscription.deleteMany).not.toHaveBeenCalled();
  });
});

describe("sendTestPushAction", () => {
  it("reports success with the number of devices reached", async () => {
    vi.mocked(sendTestPush).mockResolvedValue({ ok: true, sent: 2, devices: 2 });
    expect(await sendTestPushAction()).toMatchObject({ ok: true, message: "Test sent to 2 devices." });
    vi.mocked(sendTestPush).mockResolvedValue({ ok: true, sent: 1, devices: 1 });
    expect((await sendTestPushAction()).message).toMatch(/arrive in a moment/);
  });

  it("explains each way it can fail", async () => {
    vi.mocked(sendTestPush).mockResolvedValue({ ok: false, sent: 0, devices: 0, reason: "no-devices" });
    expect((await sendTestPushAction()).error).toMatch(/No device/);
    vi.mocked(sendTestPush).mockResolvedValue({ ok: false, sent: 0, devices: 1, reason: "delivery-failed" });
    expect((await sendTestPushAction()).error).toMatch(/couldn't be delivered/);
    configured = false;
    expect((await sendTestPushAction()).error).toMatch(/aren't set up/);
  });

  it("is limited to a few tests an hour", async () => {
    vi.mocked(enforceRateLimit).mockRejectedValue(new RateLimitError(60));
    const res = await sendTestPushAction();
    expect(res.ok).toBe(false);
    expect(sendTestPush).not.toHaveBeenCalled();
  });
});
