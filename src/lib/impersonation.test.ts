import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  signImpersonationToken,
  verifyImpersonationToken,
  impersonationModeOf,
  IMPERSONATION_TTL_SECONDS,
} from "./impersonation";
import { requireAuthSecret } from "@/lib/env";

describe("User Impersonation Token", () => {
  it("signs and successfully verifies a valid impersonation token", () => {
    const token = signImpersonationToken("sess_1", "admin_123", "user_456");
    expect(typeof token).toBe("string");
    expect(token).toContain(".");

    const payload = verifyImpersonationToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.sid).toBe("sess_1");
    expect(payload?.adminId).toBe("admin_123");
    expect(payload?.targetUserId).toBe("user_456");
  });

  it("rejects a tampered payload", () => {
    const token = signImpersonationToken("sess_1", "admin_123", "user_456");
    const [, sig] = token.split(".");
    // Tamper data
    const tamperedData = Buffer.from(JSON.stringify({ sid: "sess_1", adminId: "hacker", targetUserId: "user_456", exp: 9999999999 })).toString("base64url");
    const tamperedToken = `${tamperedData}.${sig}`;

    expect(verifyImpersonationToken(tamperedToken)).toBeNull();
  });

  it("rejects an invalid format token", () => {
    expect(verifyImpersonationToken("invalid-token-no-dot")).toBeNull();
    expect(verifyImpersonationToken("")).toBeNull();
  });

  it("refuses a correctly signed token with no session id (one minted before sessions were stored)", () => {
    const data = Buffer.from(JSON.stringify({ adminId: "a", targetUserId: "u", exp: Math.floor(Date.now() / 1000) + 600 })).toString("base64url");
    const sig = createHmac("sha256", requireAuthSecret()).update(data).digest("base64url");
    expect(verifyImpersonationToken(`${data}.${sig}`)).toBeNull();
  });

  it("refuses an expired token even with a valid signature", () => {
    const data = Buffer.from(JSON.stringify({ sid: "s", adminId: "a", targetUserId: "u", exp: Math.floor(Date.now() / 1000) - 5 })).toString("base64url");
    const sig = createHmac("sha256", requireAuthSecret()).update(data).digest("base64url");
    expect(verifyImpersonationToken(`${data}.${sig}`)).toBeNull();
  });

  it("carries the lifetime it was given, and an edit session is shorter than a read-only one", () => {
    expect(IMPERSONATION_TTL_SECONDS.edit).toBeLessThan(IMPERSONATION_TTL_SECONDS.view);
    const exp = verifyImpersonationToken(signImpersonationToken("s", "a", "u", IMPERSONATION_TTL_SECONDS.edit))!.exp;
    const left = exp - Math.floor(Date.now() / 1000);
    expect(left).toBeLessThanOrEqual(IMPERSONATION_TTL_SECONDS.edit);
    expect(left).toBeGreaterThan(IMPERSONATION_TTL_SECONDS.edit - 5);
  });
});

describe("impersonationModeOf", () => {
  it("is null outside a support session", () => {
    expect(impersonationModeOf(null)).toBeNull();
    expect(impersonationModeOf({ isImpersonated: false, impersonationMode: "edit" })).toBeNull();
  });

  it("defaults to read-only, so an unknown or missing mode never grants edits", () => {
    expect(impersonationModeOf({ isImpersonated: true })).toBe("view");
    expect(impersonationModeOf({ isImpersonated: true, impersonationMode: null })).toBe("view");
    expect(impersonationModeOf({ isImpersonated: true, impersonationMode: "root" })).toBe("view");
    expect(impersonationModeOf({ isImpersonated: true, impersonationMode: "edit" })).toBe("edit");
  });
});
