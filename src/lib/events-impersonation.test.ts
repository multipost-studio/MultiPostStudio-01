import { describe, it, expect, vi, beforeEach } from "vitest";
import { logAudit, logActivity } from "./events";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

vi.mock("@/lib/db", () => ({ db: { auditLog: { create: vi.fn() }, activityEvent: { create: vi.fn() } } }));
vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/notifications/service", () => ({ createNotification: vi.fn(), createForWorkspace: vi.fn() }));

const impersonated = { id: "customer", isImpersonated: true, impersonatorAdmin: { id: "admin1", name: "A", email: "a@x" } };
const plain = { id: "customer", isImpersonated: false, impersonatorAdmin: null };

const auditMeta = () => {
  const raw = vi.mocked(db.auditLog.create).mock.calls[0][0].data.metadata;
  return raw ? JSON.parse(raw as string) : null;
};

beforeEach(() => {
  vi.mocked(db.auditLog.create).mockReset().mockResolvedValue({} as never);
  vi.mocked(db.activityEvent.create).mockReset().mockResolvedValue({} as never);
  vi.mocked(getCurrentUser).mockReset();
});

describe("logAudit during a support session", () => {
  it("records who really acted, next to the customer named as actor", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(impersonated as never);
    await logAudit({ actorId: "customer", action: "member.removed", targetType: "user", targetId: "u2", metadata: { role: "viewer" } });
    expect(auditMeta()).toEqual({ role: "viewer", impersonatedBy: "admin1" });
  });

  it("adds the field even when there was no other metadata, and keeps a written reason", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(impersonated as never);
    await logAudit({ actorId: "customer", action: "x", targetType: "t", targetId: "1", reason: "because" });
    expect(auditMeta()).toEqual({ reason: "because", impersonatedBy: "admin1" });
  });

  it("does not stamp an ordinary session", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(plain as never);
    await logAudit({ actorId: "customer", action: "x", targetType: "t", targetId: "1", metadata: { a: 1 } });
    expect(auditMeta()).toEqual({ a: 1 });
  });

  it("does not stamp when the actor already is the administrator (the start/stop records)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(impersonated as never);
    await logAudit({ actorId: "admin1", action: "admin.impersonate_start", targetType: "user", targetId: "customer" });
    expect(vi.mocked(db.auditLog.create).mock.calls[0][0].data.metadata).toBeNull();
  });

  it("still writes the record outside a request, where there is no session", async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(new Error("headers() outside a request scope"));
    await logAudit({ actorId: null, action: "cron.x", targetType: "t", targetId: "1" });
    expect(db.auditLog.create).toHaveBeenCalledOnce();
    expect(vi.mocked(db.auditLog.create).mock.calls[0][0].data.metadata).toBeNull();
  });
});

describe("logActivity during a support session", () => {
  const input = { workspaceId: "ws1", actorId: "customer", verb: "deleted", entityType: "post", entityId: "p1", summary: 'Deleted "Launch"' };

  it("marks the timeline entry as a support session", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(impersonated as never);
    await logActivity(input);
    expect(vi.mocked(db.activityEvent.create).mock.calls[0][0].data.summary).toBe('Deleted "Launch" (support session, admin admin1)');
  });

  it("leaves an ordinary entry exactly as it was", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(plain as never);
    await logActivity(input);
    expect(vi.mocked(db.activityEvent.create).mock.calls[0][0].data).toEqual(input);
  });

  it("never fails the write because the session lookup failed", async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(new Error("no request"));
    await expect(logActivity(input)).resolves.toBeDefined();
  });
});
