import { describe, it, expect } from "vitest";
import { signImpersonationToken, verifyImpersonationToken } from "./impersonation";

describe("User Impersonation Token", () => {
  it("signs and successfully verifies a valid impersonation token", () => {
    const token = signImpersonationToken("admin_123", "user_456");
    expect(typeof token).toBe("string");
    expect(token).toContain(".");

    const payload = verifyImpersonationToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.adminId).toBe("admin_123");
    expect(payload?.targetUserId).toBe("user_456");
  });

  it("rejects a tampered payload", () => {
    const token = signImpersonationToken("admin_123", "user_456");
    const [, sig] = token.split(".");
    // Tamper data
    const tamperedData = Buffer.from(JSON.stringify({ adminId: "hacker", targetUserId: "user_456", exp: 9999999999 })).toString("base64url");
    const tamperedToken = `${tamperedData}.${sig}`;

    expect(verifyImpersonationToken(tamperedToken)).toBeNull();
  });

  it("rejects an invalid format token", () => {
    expect(verifyImpersonationToken("invalid-token-no-dot")).toBeNull();
    expect(verifyImpersonationToken("")).toBeNull();
  });
});
