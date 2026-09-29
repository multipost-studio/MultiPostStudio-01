import { describe, it, expect, vi, beforeEach } from "vitest";
import { fileRightsRequestAction, withdrawAffiliateConsentAction, adminResolvePrivacyRequestAction } from "./privacy";
import { db } from "@/lib/db";
import { requireUser, requirePlatformAdmin } from "@/lib/session";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/events", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireUser: vi.fn(), requirePlatformAdmin: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    privacyRequest: { create: vi.fn(), update: vi.fn() },
    affiliate: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

const USER = { id: "user_1", email: "u@test.com" };
const ADMIN = { id: "admin_1", email: "admin@test.com" };

describe("fileRightsRequestAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUser).mockResolvedValue(USER as Awaited<ReturnType<typeof requireUser>>);
    vi.mocked(db.privacyRequest.create).mockResolvedValue({ id: "req_1" } as never);
  });

  it("rejects a complaint with no details — an empty complaint gives the admin nothing to act on", async () => {
    const res = await fileRightsRequestAction("complaint", "   ");
    expect(res.ok).toBe(false);
    expect(db.privacyRequest.create).not.toHaveBeenCalled();
  });

  it("files the request scoped to the authenticated session user, never a caller-supplied id", async () => {
    await fileRightsRequestAction("access");
    expect(db.privacyRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: USER.id, type: "access" }) }),
    );
  });
});

describe("withdrawAffiliateConsentAction — IDOR boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUser).mockResolvedValue(USER as Awaited<ReturnType<typeof requireUser>>);
  });

  it("looks up the affiliate row by the session user's own id, not any id supplied by the action's arguments (there are none — that's the point)", async () => {
    vi.mocked(db.affiliate.findUnique).mockResolvedValue({ id: "aff_1", status: "active" } as never);
    vi.mocked(db.affiliate.update).mockResolvedValue({} as never);

    await withdrawAffiliateConsentAction();

    expect(db.affiliate.findUnique).toHaveBeenCalledWith({ where: { userId: USER.id } });
  });

  it("fails cleanly for a user with no affiliate account, rather than throwing", async () => {
    vi.mocked(db.affiliate.findUnique).mockResolvedValue(null);
    const res = await withdrawAffiliateConsentAction();
    expect(res.ok).toBe(false);
    expect(db.affiliate.update).not.toHaveBeenCalled();
  });

  it("is idempotent — withdrawing twice doesn't re-fire the audit/consent-record trail", async () => {
    vi.mocked(db.affiliate.findUnique).mockResolvedValue({ id: "aff_1", status: "suspended" } as never);
    const res = await withdrawAffiliateConsentAction();
    expect(res.ok).toBe(false);
    expect(db.affiliate.update).not.toHaveBeenCalled();
  });
});

describe("adminResolvePrivacyRequestAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requirePlatformAdmin).mockResolvedValue(ADMIN as Awaited<ReturnType<typeof requirePlatformAdmin>>);
  });

  it("requires a resolution note — every resolution becomes part of the compliance record", async () => {
    const res = await adminResolvePrivacyRequestAction("req_1", "completed", "  ");
    expect(res.ok).toBe(false);
    expect(db.privacyRequest.update).not.toHaveBeenCalled();
  });

  it("requires platform-admin auth before touching another user's request", async () => {
    vi.mocked(db.privacyRequest.update).mockResolvedValue({ id: "req_1" } as never);
    await adminResolvePrivacyRequestAction("req_1", "completed", "Data exported and emailed.");
    expect(requirePlatformAdmin).toHaveBeenCalled();
    expect(db.privacyRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "req_1" }, data: expect.objectContaining({ status: "completed", resolvedById: ADMIN.id }) }),
    );
  });
});
