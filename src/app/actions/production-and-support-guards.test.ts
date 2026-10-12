import { describe, it, expect, vi, beforeEach } from "vitest";
import { connectAccountAction } from "./integrations";
import { cancelSubscriptionAction } from "./billing";
import { updateProfileAction, changePasswordAction } from "./settings";
import { disableTwoFactorAction } from "./auth";
import { fileRightsRequestAction } from "./privacy";
import { requireWorkspace, requireUser } from "@/lib/session";
import { withPermission } from "./_helpers";
import { IMPERSONATION_BLOCKED_MESSAGE } from "@/lib/impersonation";

vi.mock("@/lib/env", async (orig) => ({ ...(await orig<typeof import("@/lib/env")>()), isProduction: true }));
vi.mock("./_helpers", async (orig) => ({ ...(await orig<typeof import("./_helpers")>()), withPermission: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireWorkspace: vi.fn(), requireUser: vi.fn(), requireAdminPermission: vi.fn(), getCurrentUser: vi.fn() }));
vi.mock("next-auth", () => ({ AuthError: class AuthError extends Error {} }));
vi.mock("@/auth", () => ({ auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), handlers: {} }));
vi.mock("@/lib/events", () => ({ logActivity: vi.fn(), logAudit: vi.fn(), notify: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/db", () => {
  const model = () => new Proxy({}, { get: () => vi.fn().mockResolvedValue(null) });
  return { db: new Proxy({}, { get: () => model() }) };
});

const owner = { active: { org: { id: "org1" }, workspace: { id: "ws1" }, orgRole: "owner", role: "owner", permissions: ["channels.connect"] } };

beforeEach(() => {
  vi.mocked(withPermission).mockReset().mockResolvedValue({ ...owner, user: { id: "u1", isImpersonated: false } } as never);
});

describe("placeholder connect in production", () => {
  it("is refused before anything is created, even for someone with channels.connect", async () => {
    const fd = new FormData();
    fd.set("platform", "instagram");
    fd.set("handle", "someone");
    const res = (await connectAccountAction(null, fd)) as { ok: boolean; error?: string };
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/own sign-in/i);
  });
});

describe("account-control actions during a support session", () => {
  it("billing actions answer with the blocked message", async () => {
    vi.mocked(requireWorkspace).mockResolvedValue({ ...owner, user: { id: "customer", isImpersonated: true } } as never);
    expect(await cancelSubscriptionAction()).toEqual({ ok: false, error: IMPERSONATION_BLOCKED_MESSAGE });
  });

  it("billing still works for the customer themselves (does not return the blocked message)", async () => {
    vi.mocked(requireWorkspace).mockResolvedValue({ ...owner, user: { id: "customer", isImpersonated: false } } as never);
    const res = (await cancelSubscriptionAction().catch(() => ({ error: "threw" }))) as { error?: string };
    expect(res.error).not.toBe(IMPERSONATION_BLOCKED_MESSAGE);
  });

  it.each([
    ["profile", () => updateProfileAction(null, new FormData())],
    ["password", () => changePasswordAction(null, new FormData())],
    ["two-factor", () => disableTwoFactorAction({ password: "x" })],
    ["privacy request", () => fileRightsRequestAction("erasure" as never)],
  ])("%s changes are refused", async (_name, call) => {
    vi.mocked(requireUser).mockResolvedValue({ id: "customer", isImpersonated: true } as never);
    const res = (await call()) as { ok: boolean; error?: string };
    expect(res).toMatchObject({ ok: false, error: IMPERSONATION_BLOCKED_MESSAGE });
  });
});
