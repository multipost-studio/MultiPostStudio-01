import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPinterestBoardsAction, setPinterestDefaultBoardAction, createPinterestBoardAction } from "./pinterest";
import { db } from "@/lib/db";
import { withPermission, ensureInWorkspace } from "./_helpers";
import { refreshIfNeeded } from "@/lib/social/oauth";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import * as api from "@/lib/integrations/pinterest";

vi.mock("./_helpers", () => ({
  withPermission: vi.fn(),
  ensureInWorkspace: vi.fn(),
  ok: (data?: unknown, message?: string) => ({ ok: true, data, message }),
  fail: (error: string) => ({ ok: false, error }),
}));
vi.mock("@/lib/social/oauth", () => ({ refreshIfNeeded: vi.fn() }));
vi.mock("@/lib/rate-limit", async (orig) => ({ ...(await orig<typeof import("@/lib/rate-limit")>()), enforceRateLimit: vi.fn() }));
vi.mock("@/lib/events", () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/integrations/pinterest", async (orig) => ({
  ...(await orig<typeof import("@/lib/integrations/pinterest")>()),
  listBoards: vi.fn(),
  createBoard: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { socialAccount: { findUnique: vi.fn(), update: vi.fn() } } }));

const CTX = { active: { workspace: { id: "ws_1" } }, user: { id: "u_1" } };
const board = (id: string, name = `Board ${id}`) => ({ id, name, privacy: "PUBLIC", pinCount: 3 });
const row = (metadata: Record<string, unknown> | null = {}, platform = "pinterest") => ({ id: "acc_1", platform, status: "connected", metadata: metadata === null ? null : JSON.stringify(metadata) });

function savedMeta(call = -1): Record<string, unknown> {
  const calls = vi.mocked(db.socialAccount.update).mock.calls;
  return JSON.parse((calls.at(call)![0].data as { metadata: string }).metadata);
}

beforeEach(() => {
  vi.mocked(withPermission).mockReset().mockResolvedValue(CTX as never);
  vi.mocked(ensureInWorkspace).mockReset().mockResolvedValue(undefined as never);
  vi.mocked(refreshIfNeeded).mockReset().mockResolvedValue("tok");
  vi.mocked(enforceRateLimit).mockReset().mockResolvedValue(undefined as never);
  vi.mocked(api.listBoards).mockReset();
  vi.mocked(api.createBoard).mockReset();
  vi.mocked(db.socialAccount.findUnique).mockReset();
  vi.mocked(db.socialAccount.update).mockReset().mockResolvedValue({} as never);
});

describe("getPinterestBoardsAction", () => {
  it("needs content.create and a workspace-owned account", async () => {
    vi.mocked(ensureInWorkspace).mockRejectedValueOnce(new Error("Unauthorized access"));
    const res = await getPinterestBoardsAction("acc_1");
    expect(withPermission).toHaveBeenCalledWith("content.create");
    expect(res).toEqual({ ok: false, error: "Unauthorized access" });
  });

  it("rejects a non-Pinterest account", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValueOnce(row({}, "facebook") as never);
    const res = await getPinterestBoardsAction("acc_1");
    expect(res.ok).toBe(false);
    expect(api.listBoards).not.toHaveBeenCalled();
  });

  it("lists boards live and caches them with the default board", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue(row({ boardId: "2" }) as never);
    vi.mocked(api.listBoards).mockResolvedValueOnce([board("1"), board("2")] as never);
    const res = await getPinterestBoardsAction("acc_1");
    expect(res.ok).toBe(true);
    expect((res.data as { boards: unknown[]; defaultBoardId: string; cached: boolean })).toMatchObject({ defaultBoardId: "2", cached: false });
    expect((savedMeta().boards as unknown[]).length).toBe(2);
  });

  it("serves a fresh cache without calling Pinterest", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue(row({ boards: [board("1")], boardsAt: new Date().toISOString() }) as never);
    const res = await getPinterestBoardsAction("acc_1");
    expect((res.data as { cached: boolean }).cached).toBe(true);
    expect(api.listBoards).not.toHaveBeenCalled();
  });

  it("fresh:true skips the cache", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue(row({ boards: [board("1")], boardsAt: new Date().toISOString() }) as never);
    vi.mocked(api.listBoards).mockResolvedValueOnce([board("1"), board("7")] as never);
    const res = await getPinterestBoardsAction("acc_1", { fresh: true });
    expect((res.data as { boards: unknown[] }).boards).toHaveLength(2);
  });

  it("falls back to the stale list when Pinterest is down", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue(row({ boards: [board("1")], boardsAt: "2020-01-01T00:00:00Z" }) as never);
    vi.mocked(api.listBoards).mockRejectedValueOnce(new Error("503"));
    const res = await getPinterestBoardsAction("acc_1");
    expect(res.ok).toBe(true);
    expect((res.data as { cached: boolean }).cached).toBe(true);
  });

  it("returns a friendly error with no cache when Pinterest fails", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue(row({}) as never);
    vi.mocked(api.listBoards).mockRejectedValueOnce(new Error("boom"));
    const res = await getPinterestBoardsAction("acc_1", { fresh: true });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Couldn't load your Pinterest boards/);
  });

  it("asks to reconnect when the token is gone", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue(row({}) as never);
    vi.mocked(refreshIfNeeded).mockResolvedValueOnce(null);
    const res = await getPinterestBoardsAction("acc_1");
    expect(res.error).toMatch(/Reconnect/);
  });

  it("uses the cache, or a polite error, when rate limited", async () => {
    vi.mocked(enforceRateLimit).mockRejectedValue(new RateLimitError(30));
    vi.mocked(db.socialAccount.findUnique).mockResolvedValueOnce(row({ boards: [board("1")], boardsAt: "2020-01-01T00:00:00Z" }) as never);
    expect((await getPinterestBoardsAction("acc_1")).ok).toBe(true);
    vi.mocked(db.socialAccount.findUnique).mockResolvedValueOnce(row({}) as never);
    expect((await getPinterestBoardsAction("acc_1")).error).toMatch(/Too many requests/);
  });
});

describe("setPinterestDefaultBoardAction", () => {
  it("needs channels.connect and a numeric board id", async () => {
    const res = await setPinterestDefaultBoardAction("acc_1", "abc; drop");
    expect(withPermission).toHaveBeenCalledWith("channels.connect");
    expect(res.ok).toBe(false);
    expect(db.socialAccount.update).not.toHaveBeenCalled();
  });

  it("refuses a board that is not on the account", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue(row({}) as never);
    vi.mocked(api.listBoards).mockResolvedValueOnce([board("1")] as never);
    const res = await setPinterestDefaultBoardAction("acc_1", "999");
    expect(res.error).toMatch(/isn't on this Pinterest account/);
    expect(db.socialAccount.update).not.toHaveBeenCalled();
  });

  it("saves the default board with its name and keeps other metadata", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue(row({ keep: "me" }) as never);
    vi.mocked(api.listBoards).mockResolvedValueOnce([board("1", "Recipes")] as never);
    const res = await setPinterestDefaultBoardAction("acc_1", "1");
    expect(res.ok).toBe(true);
    expect(savedMeta()).toMatchObject({ boardId: "1", boardName: "Recipes", keep: "me" });
  });

  it("works from the cached list when Pinterest cannot be reached", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue(row({ boards: [board("1", "Cached")] }) as never);
    vi.mocked(api.listBoards).mockRejectedValueOnce(new Error("down"));
    const res = await setPinterestDefaultBoardAction("acc_1", "1");
    expect(res.ok).toBe(true);
    expect(savedMeta()).toMatchObject({ boardName: "Cached" });
  });
});

describe("createPinterestBoardAction", () => {
  it("validates the name before any network call", async () => {
    expect((await createPinterestBoardAction("acc_1", "   ")).ok).toBe(false);
    expect((await createPinterestBoardAction("acc_1", "x".repeat(51))).ok).toBe(false);
    expect(api.createBoard).not.toHaveBeenCalled();
  });

  it("rejects an unknown privacy value", async () => {
    expect((await createPinterestBoardAction("acc_1", "Ok", "OTHER" as never)).ok).toBe(false);
  });

  it("creates the board, adds it to the cache and makes it the default when none is set", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue(row({ boards: [board("1")] }) as never);
    vi.mocked(api.createBoard).mockResolvedValueOnce(board("5", "New") as never);
    const res = await createPinterestBoardAction("acc_1", "  New  ");
    expect(res.ok).toBe(true);
    expect(api.createBoard).toHaveBeenCalledWith("tok", { name: "New", privacy: "PUBLIC" });
    const meta = savedMeta();
    expect((meta.boards as { id: string }[]).map((b) => b.id)).toEqual(["5", "1"]);
    expect(meta.boardId).toBe("5");
  });

  it("does not replace an existing default board", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue(row({ boardId: "1", boardName: "Old" }) as never);
    vi.mocked(api.createBoard).mockResolvedValueOnce(board("5") as never);
    await createPinterestBoardAction("acc_1", "New", "SECRET");
    expect(savedMeta().boardId).toBe("1");
  });

  it("limits how many boards can be created per hour", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue(row({}) as never);
    vi.mocked(enforceRateLimit).mockRejectedValueOnce(new RateLimitError(10));
    const res = await createPinterestBoardAction("acc_1", "New");
    expect(res.error).toMatch(/Try again in an hour/);
    expect(api.createBoard).not.toHaveBeenCalled();
  });

  it("turns a Pinterest refusal into guidance without leaking the raw error", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue(row({}) as never);
    vi.mocked(api.createBoard).mockRejectedValueOnce(new Error("Pinterest create board 403: token abc"));
    const res = await createPinterestBoardAction("acc_1", "New");
    expect(res.error).toMatch(/Reconnect/);
    expect(res.error).not.toMatch(/abc/);
  });
});
