import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/env", () => ({ isProduction: false }));
vi.mock("@/lib/entitlements", () => ({ hasEntitlement: vi.fn(), planLimit: vi.fn() }));
vi.mock("@/lib/events", () => ({ logActivity: vi.fn(), logAudit: vi.fn() }));
vi.mock("@/lib/adapters/ai", () => ({ brandBrainDigestAsync: vi.fn() }));
vi.mock("@/lib/rbac", () => ({ assertPermission: vi.fn() }));
vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(),
  getWorkspaceContext: vi.fn(),
  requireWorkspace: vi.fn(async () => ({ active: { role: "manager", workspace: { id: "w1" }, org: { id: "o1" } }, user: { id: "u1" } })),
  WS_COOKIE: "ws",
}));
vi.mock("@/lib/db", () => ({ db: { workspace: { update: vi.fn() } } }));

import { db } from "@/lib/db";
import { assertPermission } from "@/lib/rbac";
import { updateWorkspaceAction } from "./workspace";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  Object.entries(o).forEach(([k, v]) => f.set(k, v));
  return f;
};
const data = () => vi.mocked(db.workspace.update).mock.calls[0][0].data as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.workspace.update).mockResolvedValue({} as never);
});

describe("workspace time zone", () => {
  it("saves a valid zone", async () => {
    const r = (await updateWorkspaceAction(null, form({ name: "Acme", timezone: "Asia/Kolkata" }))) as { ok: boolean };
    expect(r.ok).toBe(true);
    expect(data().timezone).toBe("Asia/Kolkata");
  });

  it("an empty choice clears it back to not set", async () => {
    await updateWorkspaceAction(null, form({ name: "Acme", timezone: "" }));
    expect(data().timezone).toBeNull();
  });

  it("leaves it alone when the form does not send the field", async () => {
    await updateWorkspaceAction(null, form({ name: "Acme" }));
    expect("timezone" in data()).toBe(false);
  });

  it("rejects a made-up zone and saves nothing", async () => {
    const r = (await updateWorkspaceAction(null, form({ name: "Acme", timezone: "Mars/Olympus" }))) as { ok: boolean; error?: string };
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/time zone/i);
    expect(db.workspace.update).not.toHaveBeenCalled();
  });

  it("is only for people who can manage the workspace", async () => {
    vi.mocked(assertPermission).mockImplementationOnce(() => {
      throw new Error("forbidden");
    });
    await expect(updateWorkspaceAction(null, form({ name: "Acme", timezone: "UTC" }))).rejects.toThrow("forbidden");
    expect(db.workspace.update).not.toHaveBeenCalled();
  });
});
