import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const m = vi.hoisted(() => ({
  ctx: null as Record<string, unknown> | null,
  request: null as Row | null,
  token: null as Row | null,
  entitled: true,
  claimable: true,
  logAudit: vi.fn(async () => undefined),
  updateMany: vi.fn(),
  deleteMany: vi.fn(async () => ({ count: 1 })),
  tokenUpdate: vi.fn(async () => ({})),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/session", () => ({ getWorkspaceContext: vi.fn(async () => m.ctx) }));
vi.mock("@/lib/entitlements", () => ({ hasEntitlement: vi.fn(async () => m.entitled) }));
vi.mock("@/lib/events", () => ({ logAudit: m.logAudit }));
vi.mock("@/lib/env", () => ({ appUrl: (p = "") => `https://app.example.com${p}` }));
vi.mock("@/lib/db", () => ({
  db: {
    oAuthAuthRequest: { findUnique: vi.fn(async () => m.request), updateMany: m.updateMany, deleteMany: m.deleteMany },
    oAuthToken: { findUnique: vi.fn(async () => m.token), update: m.tokenUpdate },
  },
}));

import { approveAiAccessAction, denyAiAccessAction, revokeAiAppAction } from "./mcp-oauth";

const sha = (v: string) => createHash("sha256").update(v).digest("hex");

const member = (orgRole: string, over: Row = {}) => ({
  workspace: { id: "w1", name: "Main" },
  org: { id: "o1", name: "Acme" },
  orgRole,
  workspaceRole: null,
  customPerms: null,
  ...over,
});
const ctxOf = (workspaces: Row[], over: Row = {}) => ({ user: { id: "u1", email: "me@example.com", isImpersonated: false, ...over }, workspaces, active: {} });

const openRequest = (over: Row = {}): Row => ({
  id: "mpq_1",
  clientId: "mpc_a",
  redirectUri: "https://claude.ai/cb?x=1",
  state: "st",
  expiresAt: new Date(Date.now() + 600_000),
  codeHash: null,
  usedAt: null,
  client: { name: "Claude" },
  ...over,
});

const form = (fields: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) (Array.isArray(v) ? v : [v]).forEach((x) => fd.append(k, x));
  return fd;
};
const approveForm = (over: Record<string, string | string[]> = {}) => form({ request: "mpq_1", target: "org:o1", scopes: ["posts:read", "channels:read"], ...over });

beforeEach(() => {
  vi.clearAllMocks();
  m.ctx = ctxOf([member("owner")]);
  m.request = openRequest();
  m.token = null;
  m.entitled = true;
  m.updateMany.mockResolvedValue({ count: 1 });
});

describe("approving a connection", () => {
  it("records who, where and what, stores only the code's hash, and returns the address that carries the code", async () => {
    const res = await approveAiAccessAction(approveForm());
    expect(res.ok).toBe(true);
    const url = new URL(res.redirectTo!);
    expect(url.origin + url.pathname).toBe("https://claude.ai/cb");
    expect(url.searchParams.get("x")).toBe("1"); // the app's own query survives
    expect(url.searchParams.get("state")).toBe("st");
    const code = url.searchParams.get("code")!;
    expect(code).toMatch(/^mpa_/);

    const call = m.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "mpq_1", codeHash: null, usedAt: null });
    expect(call.data).toMatchObject({ userId: "u1", orgId: "o1", workspaceId: null, grantedScopes: JSON.stringify(["posts:read", "channels:read"]), codeHash: sha(code) });
    expect(JSON.stringify(call.data)).not.toContain(code);
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "ai.connected", orgId: "o1", actorId: "u1" }));
  });

  it("can limit the connection to one workspace", async () => {
    await approveAiAccessAction(approveForm({ target: "ws:w1" }));
    expect(m.updateMany.mock.calls[0][0].data).toMatchObject({ orgId: "o1", workspaceId: "w1" });
  });

  it("keeps only permissions an assistant can actually use, and needs at least one", async () => {
    await approveAiAccessAction(approveForm({ scopes: ["posts:read", "webhooks:manage", "media:write", "nonsense"] }));
    expect(m.updateMany.mock.calls[0][0].data.grantedScopes).toBe(JSON.stringify(["posts:read"]));
    m.updateMany.mockClear();
    const none = await approveAiAccessAction(approveForm({ scopes: ["webhooks:manage"] }));
    expect(none.ok).toBe(false);
    expect(m.updateMany).not.toHaveBeenCalled();
  });

  it("refuses someone who couldn't create an API key (a viewer), and a workspace they don't belong to", async () => {
    m.ctx = ctxOf([member("viewer")]);
    expect((await approveAiAccessAction(approveForm())).ok).toBe(false);
    m.ctx = ctxOf([member("owner")]);
    expect((await approveAiAccessAction(approveForm({ target: "org:someone-elses" }))).ok).toBe(false);
    expect((await approveAiAccessAction(approveForm({ target: "ws:w999" }))).ok).toBe(false);
    expect(m.updateMany).not.toHaveBeenCalled();
  });

  it("refuses when the plan has no API access", async () => {
    m.entitled = false;
    const res = await approveAiAccessAction(approveForm());
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/plan/);
  });

  it("refuses an expired, already approved or unknown request, no session, and support viewing as the customer", async () => {
    m.request = openRequest({ expiresAt: new Date(Date.now() - 1) });
    expect((await approveAiAccessAction(approveForm())).ok).toBe(false);
    m.request = openRequest({ codeHash: "x" });
    expect((await approveAiAccessAction(approveForm())).ok).toBe(false);
    m.request = null;
    expect((await approveAiAccessAction(approveForm())).ok).toBe(false);
    m.request = openRequest();
    m.ctx = null;
    expect((await approveAiAccessAction(approveForm())).error).toMatch(/Sign in/);
    m.ctx = ctxOf([member("owner")], { isImpersonated: true });
    expect((await approveAiAccessAction(approveForm())).ok).toBe(false);
    expect(m.updateMany).not.toHaveBeenCalled();
  });

  it("can only be approved once: a second click finds it taken", async () => {
    m.updateMany.mockResolvedValue({ count: 0 });
    const res = await approveAiAccessAction(approveForm());
    expect(res).toMatchObject({ ok: false });
    expect(res.redirectTo).toBeUndefined();
  });

  it("an admin of one org can't connect another org they only belong to as a viewer", async () => {
    m.ctx = ctxOf([member("admin"), member("viewer", { org: { id: "o2", name: "Other" }, workspace: { id: "w2", name: "Other ws" } })]);
    expect((await approveAiAccessAction(approveForm({ target: "org:o2" }))).ok).toBe(false);
    expect((await approveAiAccessAction(approveForm({ target: "org:o1" }))).ok).toBe(true);
  });
});

describe("declining", () => {
  it("tells the assistant no and discards the request", async () => {
    const res = await denyAiAccessAction("mpq_1");
    const url = new URL(res.redirectTo!);
    expect(url.searchParams.get("error")).toBe("access_denied");
    expect(url.searchParams.get("state")).toBe("st");
    expect(m.deleteMany).toHaveBeenCalledWith({ where: { id: "mpq_1", codeHash: null } });
  });
  it("does nothing for an unknown request", async () => {
    m.request = null;
    expect((await denyAiAccessAction("nope")).ok).toBe(false);
    expect(m.deleteMany).not.toHaveBeenCalled();
  });
});

describe("disconnecting an assistant", () => {
  beforeEach(() => {
    m.token = { id: "t1", orgId: "o1", client: { name: "Claude" } };
  });
  it("revokes it for someone who manages that organisation", async () => {
    expect(await revokeAiAppAction("t1")).toEqual({ ok: true });
    expect(m.tokenUpdate).toHaveBeenCalledWith({ where: { id: "t1" }, data: { revokedAt: expect.any(Date) } });
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "ai.disconnected" }));
  });
  it("a workspace-level manager can disconnect that workspace's connection, but not an organisation-wide one", async () => {
    // manager of w1 only: the org-level role is a viewer, the workspace role is manager
    m.ctx = ctxOf([member("viewer", { workspaceRole: "manager" })]);
    m.token = { id: "t3", orgId: "o1", workspaceId: "w1", client: { name: "Claude" } };
    expect((await revokeAiAppAction("t3")).ok).toBe(true);
    m.token = { id: "t4", orgId: "o1", workspaceId: null, client: { name: "Claude" } };
    expect((await revokeAiAppAction("t4")).ok).toBe(false);
    m.token = { id: "t5", orgId: "o1", workspaceId: "w2", client: { name: "Claude" } };
    expect((await revokeAiAppAction("t5")).ok).toBe(false);
  });

  it("won't touch another organisation's connection, or one for someone who can't manage", async () => {
    m.token = { id: "t2", orgId: "other", client: { name: "X" } };
    expect((await revokeAiAppAction("t2")).ok).toBe(false);
    m.token = { id: "t1", orgId: "o1", client: { name: "Claude" } };
    m.ctx = ctxOf([member("viewer")]);
    expect((await revokeAiAppAction("t1")).ok).toBe(false);
    expect(m.tokenUpdate).not.toHaveBeenCalled();
  });
});
