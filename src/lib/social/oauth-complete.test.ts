import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { completeAuthorization, ConnectNotAllowedError } from "./oauth";
import { db } from "@/lib/db";
import { getProvider } from "./providers";
import { planLimit } from "@/lib/entitlements";

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/notifications/account-notify", () => ({ notifyAccountExpired: vi.fn() }));
vi.mock("@/lib/entitlements", () => ({ planLimit: vi.fn() }));
vi.mock("./providers", () => ({ getProvider: vi.fn(), oauthRedirectUri: vi.fn(() => "https://app.example.com/api/oauth/x/callback") }));
vi.mock("@/lib/db", () => ({
  db: {
    workspace: { findUnique: vi.fn() },
    membership: { findUnique: vi.fn() },
    socialAccount: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    socialChannel: { count: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  },
}));

const state = (platform = "pinterest") => ({ platform, workspaceId: "ws1", userId: "u1", nonce: "n", exp: Date.now() + 60_000 });
const provider = (key = "pinterest") => ({
  key,
  tokenUrl: "https://p.example/token",
  scopes: ["a"],
  usePKCE: false,
  clientId: () => "id",
  clientSecret: () => "secret",
  identify: async () => ({ remoteId: "r1", handle: "@new", displayName: "New" }),
});

function member(role: string, opts: { wsRole?: string; custom?: string[]; status?: string } = {}) {
  vi.mocked(db.workspace.findUnique).mockResolvedValue({ orgId: "org1", members: opts.wsRole ? [{ role: opts.wsRole }] : [] } as never);
  vi.mocked(db.membership.findUnique).mockResolvedValue({
    role,
    status: opts.status ?? "active",
    customRole: opts.custom ? { permissions: JSON.stringify(opts.custom) } : null,
  } as never);
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ access_token: "at", refresh_token: "rt", expires_in: 3600 }), text: async () => "" });
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(getProvider).mockReset().mockReturnValue(provider() as never);
  vi.mocked(planLimit).mockReset().mockResolvedValue(0);
  vi.mocked(db.workspace.findUnique).mockReset();
  vi.mocked(db.membership.findUnique).mockReset();
  vi.mocked(db.socialAccount.findFirst).mockReset().mockResolvedValue(null);
  vi.mocked(db.socialAccount.create).mockReset().mockResolvedValue({ id: "acc1" } as never);
  vi.mocked(db.socialAccount.update).mockReset().mockResolvedValue({ id: "acc1" } as never);
  vi.mocked(db.socialChannel.count).mockReset().mockResolvedValue(0);
  vi.mocked(db.socialChannel.findFirst).mockReset().mockResolvedValue(null);
  vi.mocked(db.socialChannel.create).mockReset().mockResolvedValue({} as never);
});

afterEach(() => vi.unstubAllGlobals());

async function reason(p: Promise<unknown>) {
  const err = await p.then(() => null, (e) => e);
  return err instanceof ConnectNotAllowedError ? err.reason : err ? `other: ${(err as Error).message}` : "allowed";
}

describe("completeAuthorization: who may finish a connection", () => {
  it("refuses someone who is no longer a member, before spending the authorization code", async () => {
    vi.mocked(db.workspace.findUnique).mockResolvedValue({ orgId: "org1", members: [] } as never);
    vi.mocked(db.membership.findUnique).mockResolvedValue(null);
    expect(await reason(completeAuthorization(state(), "code"))).toBe("membership");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.socialAccount.create).not.toHaveBeenCalled();
  });

  it("refuses a workspace that no longer exists", async () => {
    vi.mocked(db.workspace.findUnique).mockResolvedValue(null);
    expect(await reason(completeAuthorization(state(), "code"))).toBe("membership");
  });

  it("refuses a suspended membership", async () => {
    member("owner", { status: "suspended" });
    expect(await reason(completeAuthorization(state(), "code"))).toBe("membership");
  });

  it.each(["viewer", "analyst", "creator", "editor"])("refuses a %s, who lacks channels.connect", async (role) => {
    member(role);
    expect(await reason(completeAuthorization(state(), "code"))).toBe("membership");
  });

  it("allows a manager, an admin and an owner", async () => {
    for (const role of ["manager", "admin", "owner"]) {
      member(role);
      expect(await reason(completeAuthorization(state(), "code"))).toBe("allowed");
    }
  });

  it("uses the role the person has now: a manager demoted to viewer in this workspace is refused", async () => {
    member("manager", { wsRole: "viewer" });
    expect(await reason(completeAuthorization(state(), "code"))).toBe("membership");
  });

  it("an admin is never reduced by a workspace row", async () => {
    member("admin", { wsRole: "viewer" });
    expect(await reason(completeAuthorization(state(), "code"))).toBe("allowed");
  });

  it("a custom role decides on its own permission list", async () => {
    member("editor", { custom: ["channels.connect"] });
    expect(await reason(completeAuthorization(state(), "code"))).toBe("allowed");
    member("manager", { custom: ["content.create"] });
    expect(await reason(completeAuthorization(state(), "code"))).toBe("membership");
  });
});

describe("completeAuthorization: plan channel limit", () => {
  beforeEach(() => member("owner"));

  it("refuses a new account when the plan's channel limit is reached", async () => {
    vi.mocked(planLimit).mockResolvedValue(3);
    vi.mocked(db.socialChannel.count).mockResolvedValue(3);
    expect(await reason(completeAuthorization(state(), "code"))).toBe("limit");
    expect(db.socialAccount.create).not.toHaveBeenCalled();
    expect(db.socialChannel.create).not.toHaveBeenCalled();
  });

  it("allows a new account below the limit", async () => {
    vi.mocked(planLimit).mockResolvedValue(3);
    vi.mocked(db.socialChannel.count).mockResolvedValue(2);
    expect(await reason(completeAuthorization(state(), "code"))).toBe("allowed");
    expect(db.socialChannel.create).toHaveBeenCalledOnce();
  });

  it("reconnecting an account that already exists is never blocked by the limit", async () => {
    vi.mocked(planLimit).mockResolvedValue(3);
    vi.mocked(db.socialChannel.count).mockResolvedValue(3);
    vi.mocked(db.socialAccount.findFirst).mockResolvedValue({ id: "acc1" } as never);
    expect(await reason(completeAuthorization(state(), "code"))).toBe("allowed");
    expect(db.socialAccount.update).toHaveBeenCalledOnce();
  });

  it("a limit of 0 means unlimited", async () => {
    vi.mocked(planLimit).mockResolvedValue(0);
    vi.mocked(db.socialChannel.count).mockResolvedValue(999);
    expect(await reason(completeAuthorization(state(), "code"))).toBe("allowed");
    expect(db.socialChannel.count).not.toHaveBeenCalled();
  });

  it("Google Business Profile is limited when locations are chosen, not here", async () => {
    vi.mocked(getProvider).mockReturnValue(provider("gbp") as never);
    vi.mocked(planLimit).mockResolvedValue(1);
    vi.mocked(db.socialChannel.count).mockResolvedValue(5);
    expect(await reason(completeAuthorization(state("gbp"), "code"))).toBe("allowed");
  });
});
