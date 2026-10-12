import { describe, it, expect, vi, beforeEach } from "vitest";
import { setRequireApprovalAction } from "./approvals";
import { db } from "@/lib/db";
import { withPermission, entitlementGuard } from "./_helpers";
import { logAudit } from "@/lib/events";

vi.mock("./_helpers", () => ({
  withPermission: vi.fn(),
  entitlementGuard: vi.fn(),
  ensureInWorkspace: vi.fn(),
  snapshotPostVersion: vi.fn(),
  ok: (data?: unknown, message?: string) => ({ ok: true, data, message }),
  fail: (error: string) => ({ ok: false, error }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/events", () => ({ logActivity: vi.fn(), notifyWorkspace: vi.fn(), notifyMentions: vi.fn(), logAudit: vi.fn() }));
vi.mock("@/lib/adapters/webhooks", () => ({ dispatchWebhook: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { workspace: { update: vi.fn() } } }));

const ctx = (requireApproval: boolean) => ({
  active: { org: { id: "org1" }, workspace: { id: "ws1", requireApproval } },
  user: { id: "u1" },
});

beforeEach(() => {
  vi.mocked(withPermission).mockReset().mockResolvedValue(ctx(false) as never);
  vi.mocked(entitlementGuard).mockReset().mockResolvedValue(null);
  vi.mocked(db.workspace.update).mockReset().mockResolvedValue({} as never);
  vi.mocked(logAudit).mockReset();
});

describe("setRequireApprovalAction", () => {
  it("needs approvals.configure", async () => {
    await setRequireApprovalAction(true);
    expect(withPermission).toHaveBeenCalledWith("approvals.configure");
  });

  it("turns mandatory approval on, and records who did it", async () => {
    const res = await setRequireApprovalAction(true);
    expect(res.ok).toBe(true);
    expect(db.workspace.update).toHaveBeenCalledWith({ where: { id: "ws1" }, data: { requireApproval: true } });
    expect(vi.mocked(logAudit).mock.calls[0][0]).toMatchObject({ action: "workspace.approval_required", actorId: "u1", targetId: "ws1" });
  });

  it("needs the approval-workflows plan feature to turn it on", async () => {
    vi.mocked(entitlementGuard).mockResolvedValue({ ok: false, error: "Approval workflows isn't included in your current plan." });
    const res = await setRequireApprovalAction(true);
    expect(res.ok).toBe(false);
    expect(db.workspace.update).not.toHaveBeenCalled();
  });

  it("turning it off never needs the plan feature, so a downgrade cannot trap a workspace in it", async () => {
    vi.mocked(withPermission).mockResolvedValue(ctx(true) as never);
    vi.mocked(entitlementGuard).mockResolvedValue({ ok: false, error: "not in plan" });
    const res = await setRequireApprovalAction(false);
    expect(res.ok).toBe(true);
    expect(db.workspace.update).toHaveBeenCalledWith({ where: { id: "ws1" }, data: { requireApproval: false } });
    expect(entitlementGuard).not.toHaveBeenCalled();
  });

  it("is a no-op when it is already in that state, and rejects anything that is not a boolean", async () => {
    await setRequireApprovalAction(false);
    expect(db.workspace.update).not.toHaveBeenCalled();
    expect((await setRequireApprovalAction("yes" as never)).ok).toBe(false);
  });
});
