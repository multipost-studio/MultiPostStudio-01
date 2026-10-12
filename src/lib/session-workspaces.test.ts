import { describe, it, expect, vi, beforeEach } from "vitest";
import { getWorkspaceContext } from "./session";
import { db } from "@/lib/db";
import { auth } from "@/auth";

let cookieWs = "";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: (k: string) => (k === "mps_ws" ? { value: cookieWs } : undefined) })),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: vi.fn() }, membership: { findMany: vi.fn() } } }));

const ws = (id: string, restricted: boolean, hasRow: boolean, rowRole = "editor") => ({
  id,
  name: id,
  restricted,
  archived: false,
  members: hasRow ? [{ role: rowRole }] : [],
});

function memberOf(role: string, workspaces: ReturnType<typeof ws>[]) {
  vi.mocked(db.membership.findMany).mockResolvedValue([
    { role, status: "active", customRole: null, org: { id: "org1", workspaces, subscription: null } },
  ] as never);
}

beforeEach(() => {
  cookieWs = "";
  vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);
  vi.mocked(db.user.findUnique).mockResolvedValue({ id: "u1", isPlatformAdmin: false, platformRole: null, suspendedAt: null, deletedAt: null } as never);
});

const ids = async () => (await getWorkspaceContext())!.workspaces.map((w) => w.workspace.id);

describe("getWorkspaceContext with restricted workspaces", () => {
  it("lists every workspace while none is restricted (unchanged behaviour)", async () => {
    memberOf("viewer", [ws("a", false, false), ws("b", false, false)]);
    expect(await ids()).toEqual(["a", "b"]);
  });

  it("hides a restricted workspace from a member who was not added", async () => {
    memberOf("editor", [ws("a", false, false), ws("secret", true, false)]);
    expect(await ids()).toEqual(["a"]);
  });

  it("shows it to a member who was added, with the role on their workspace row", async () => {
    memberOf("editor", [ws("secret", true, true, "viewer")]);
    const ctx = (await getWorkspaceContext())!;
    expect(ctx.workspaces.map((w) => w.workspace.id)).toEqual(["secret"]);
    expect(ctx.active!.role).toBe("viewer");
  });

  it("always shows it to owners and admins", async () => {
    memberOf("admin", [ws("secret", true, false)]);
    expect(await ids()).toEqual(["secret"]);
    memberOf("owner", [ws("secret", true, false)]);
    expect(await ids()).toEqual(["secret"]);
  });

  it("a stale workspace cookie for a restricted workspace falls back to one they can open", async () => {
    cookieWs = "secret";
    memberOf("editor", [ws("a", false, false), ws("secret", true, false)]);
    expect((await getWorkspaceContext())!.active!.workspace.id).toBe("a");
  });

  it("someone with nothing to open gets no active workspace instead of a restricted one", async () => {
    memberOf("editor", [ws("secret", true, false)]);
    expect((await getWorkspaceContext())!.active).toBeNull();
  });
});
