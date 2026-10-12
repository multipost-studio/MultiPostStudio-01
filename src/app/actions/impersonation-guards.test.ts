import { describe, it, expect, vi, beforeEach } from "vitest";
import { withPermission } from "./_helpers";
import { requireWorkspace } from "@/lib/session";
import {
  IMPERSONATION_BLOCKED_PERMISSIONS,
  ImpersonationBlockedError,
  signImpersonationToken,
  verifyImpersonationToken,
} from "@/lib/impersonation";

vi.mock("@/lib/session", () => ({ requireWorkspace: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/entitlements", () => ({ hasEntitlement: vi.fn(), planLimit: vi.fn() }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: vi.fn() }));

const ALL = ["members.manage", "billing.manage", "integrations.manage", "channels.connect", "workspace.manage", "ai.providers.manage", "content.create", "content.publish", "analytics.view"];

function ctx(impersonated: boolean, mode: "view" | "edit" | null = null) {
  return { user: { id: "customer", isImpersonated: impersonated, impersonationMode: mode }, active: { role: "owner", permissions: ALL } };
}

beforeEach(() => vi.mocked(requireWorkspace).mockReset());

describe("withPermission in an edit session", () => {
  it.each([...IMPERSONATION_BLOCKED_PERMISSIONS])("still refuses %s: account control stays with the customer", async (perm) => {
    vi.mocked(requireWorkspace).mockResolvedValue(ctx(true, "edit") as never);
    await expect(withPermission(perm as never)).rejects.toBeInstanceOf(ImpersonationBlockedError);
  });

  it("allows ordinary content and analytics work", async () => {
    vi.mocked(requireWorkspace).mockResolvedValue(ctx(true, "edit") as never);
    await expect(withPermission("content.create")).resolves.toBeDefined();
    await expect(withPermission("content.publish")).resolves.toBeDefined();
    await expect(withPermission("analytics.view")).resolves.toBeDefined();
  });
});

describe("withPermission in a read-only session (the default)", () => {
  it.each(ALL.filter((p) => p !== "analytics.view"))("refuses %s", async (perm) => {
    vi.mocked(requireWorkspace).mockResolvedValue(ctx(true, "view") as never);
    await expect(withPermission(perm as never)).rejects.toThrow(/read-only/);
  });

  it("allows reading analytics", async () => {
    vi.mocked(requireWorkspace).mockResolvedValue(ctx(true, "view") as never);
    await expect(withPermission("analytics.view")).resolves.toBeDefined();
  });

  it("a session with no recorded mode is treated as read-only, never as edit", async () => {
    vi.mocked(requireWorkspace).mockResolvedValue(ctx(true, null) as never);
    await expect(withPermission("content.create")).rejects.toBeInstanceOf(ImpersonationBlockedError);
  });
});

describe("withPermission for a customer acting as themselves", () => {
  it("is unchanged for every permission", async () => {
    vi.mocked(requireWorkspace).mockResolvedValue(ctx(false) as never);
    for (const perm of ALL) await expect(withPermission(perm as never)).resolves.toBeDefined();
  });

  it("the blocked set covers what controls access, billing and connections", () => {
    for (const p of ["members.manage", "billing.manage", "integrations.manage", "channels.connect"]) {
      expect(IMPERSONATION_BLOCKED_PERMISSIONS.has(p)).toBe(true);
    }
    expect(IMPERSONATION_BLOCKED_PERMISSIONS.has("content.create")).toBe(false);
  });
});

describe("impersonation token", () => {
  it("round-trips and carries both ids", () => {
    const t = signImpersonationToken("sess1", "admin1", "user1");
    expect(verifyImpersonationToken(t)).toMatchObject({ adminId: "admin1", targetUserId: "user1" });
  });

  it("rejects a tampered payload and a tampered signature", () => {
    const t = signImpersonationToken("sess1", "admin1", "user1");
    const [data, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ sid: "sess1", adminId: "admin1", targetUserId: "someone-else", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
    expect(verifyImpersonationToken(`${forged}.${sig}`)).toBeNull();
    expect(verifyImpersonationToken(`${data}.${sig.slice(0, -2)}xx`)).toBeNull();
    expect(verifyImpersonationToken("garbage")).toBeNull();
  });

  it("is not signed with the old constant fallback secret", async () => {
    const { createHmac } = await import("node:crypto");
    const t = signImpersonationToken("sess1", "admin1", "user1");
    const [data, sig] = t.split(".");
    const withFallback = createHmac("sha256", "fallback-secret-for-dev-only-min16").update(data).digest("base64url");
    expect(sig).not.toBe(withFallback);
  });
});
