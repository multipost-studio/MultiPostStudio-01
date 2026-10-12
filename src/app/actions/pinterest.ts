"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/events";
import { refreshIfNeeded } from "@/lib/social/oauth";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { checkBoardName, createBoard, explainPinterestError, listBoards, type PinterestBoard } from "@/lib/integrations/pinterest";
import { withPermission, ensureInWorkspace, ok, fail } from "./_helpers";

/**
 * Pinterest boards for a connected account: list them (for the composer and Integrations), choose the account's default
 * board, and create a new one. Boards are read live from Pinterest and a short list is cached on the account so the pickers
 * keep working when Pinterest is briefly unreachable. Every call checks the account belongs to the caller's workspace.
 */
export type BoardChoice = { id: string; name: string; privacy: string; pinCount: number };
export type BoardList = { boards: BoardChoice[]; defaultBoardId: string | null; cached: boolean };

const CACHE_FRESH_MS = 60_000;
const MAX_CACHED = 250;
const BOARD_ID = /^[0-9]{1,30}$/;

type Meta = { boardId?: string; boardName?: string; boards?: BoardChoice[]; boardsAt?: string } & Record<string, unknown>;

function readMeta(raw: string | null): Meta {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Meta) : {};
  } catch {
    return {};
  }
}

const toChoice = (b: PinterestBoard): BoardChoice => ({ id: b.id, name: b.name, privacy: b.privacy, pinCount: b.pinCount });

/** Merge a patch into the account's metadata using its latest stored value, so concurrent changes are not overwritten. */
async function patchMeta(accountId: string, patch: Partial<Meta>): Promise<Meta> {
  const row = await db.socialAccount.findUnique({ where: { id: accountId }, select: { metadata: true } });
  const next = { ...readMeta(row?.metadata ?? null), ...patch };
  await db.socialAccount.update({ where: { id: accountId }, data: { metadata: JSON.stringify(next) } });
  return next;
}

async function loadAccount(accountId: string, workspaceId: string) {
  await ensureInWorkspace("socialAccount", accountId, workspaceId);
  const account = await db.socialAccount.findUnique({ where: { id: accountId }, select: { id: true, platform: true, metadata: true, status: true } });
  return account && account.platform === "pinterest" ? account : null;
}

export async function getPinterestBoardsAction(accountId: string, opts: { fresh?: boolean } = {}) {
  const ctx = await withPermission("content.create");
  if (typeof accountId !== "string" || !accountId) return fail("Invalid request");
  try {
    const account = await loadAccount(accountId, ctx.active.workspace.id);
    if (!account) return fail("Pinterest account not found in this workspace");
    const meta = readMeta(account.metadata);
    const cachedAt = meta.boardsAt ? Date.parse(meta.boardsAt) : 0;
    if (!opts.fresh && meta.boards?.length && Date.now() - cachedAt < CACHE_FRESH_MS) {
      return ok<BoardList>({ boards: meta.boards, defaultBoardId: meta.boardId ?? null, cached: true });
    }
    try {
      await enforceRateLimit(`pinterest-boards:${account.id}`, 30, 60_000);
    } catch (e) {
      if (e instanceof RateLimitError && meta.boards?.length) return ok<BoardList>({ boards: meta.boards, defaultBoardId: meta.boardId ?? null, cached: true });
      if (e instanceof RateLimitError) return fail("Too many requests. Try again in a minute.");
      throw e;
    }

    const token = await refreshIfNeeded(account.id);
    if (!token) return fail("Pinterest authorization expired. Reconnect the account in Integrations.");
    try {
      const boards = (await listBoards(token, MAX_CACHED)).map(toChoice);
      await patchMeta(account.id, { boards, boardsAt: new Date().toISOString() });
      return ok<BoardList>({ boards, defaultBoardId: meta.boardId ?? null, cached: false });
    } catch (err) {
      logger.warn({ err, accountId }, "pinterest board list failed");
      if (meta.boards?.length) return ok<BoardList>({ boards: meta.boards, defaultBoardId: meta.boardId ?? null, cached: true });
      return fail(explainPinterestError(err).includes("Standard access") ? "Pinterest hasn't approved this app for full access yet." : "Couldn't load your Pinterest boards. Try again in a moment.");
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't load boards");
  }
}

export async function setPinterestDefaultBoardAction(accountId: string, boardId: string) {
  const ctx = await withPermission("channels.connect");
  if (typeof accountId !== "string" || !accountId || typeof boardId !== "string" || !BOARD_ID.test(boardId)) return fail("Invalid request");
  try {
    const account = await loadAccount(accountId, ctx.active.workspace.id);
    if (!account) return fail("Pinterest account not found in this workspace");
    // Only a board that belongs to this account can be chosen: check the live list, falling back to the cached one.
    let known: BoardChoice[] = readMeta(account.metadata).boards ?? [];
    const token = await refreshIfNeeded(account.id);
    if (token) {
      try {
        known = (await listBoards(token, MAX_CACHED)).map(toChoice);
      } catch {
        /* keep the cached list */
      }
    }
    const board = known.find((b) => b.id === boardId);
    if (!board) return fail("That board isn't on this Pinterest account.");
    await patchMeta(account.id, { boardId: board.id, boardName: board.name, boards: known, boardsAt: new Date().toISOString() });
    await logActivity({ workspaceId: ctx.active.workspace.id, actorId: ctx.user.id, verb: "updated", entityType: "social_account", entityId: account.id, summary: `Pinterest default board set to "${board.name}"` }).catch(() => undefined);
    revalidatePath("/integrations");
    return ok(undefined, `Pins will go to "${board.name}" unless a post picks another board.`);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't save the board");
  }
}

export async function createPinterestBoardAction(accountId: string, name: string, privacy: "PUBLIC" | "SECRET" = "PUBLIC") {
  const ctx = await withPermission("channels.connect");
  if (typeof accountId !== "string" || !accountId) return fail("Invalid request");
  const checked = checkBoardName(name);
  if (!checked.ok) return fail(checked.error);
  if (privacy !== "PUBLIC" && privacy !== "SECRET") return fail("Invalid request");
  try {
    const account = await loadAccount(accountId, ctx.active.workspace.id);
    if (!account) return fail("Pinterest account not found in this workspace");
    try {
      await enforceRateLimit(`pinterest-board-create:${account.id}`, 10, 3_600_000);
    } catch (e) {
      if (e instanceof RateLimitError) return fail("You created a few boards already. Try again in an hour.");
      throw e;
    }
    const token = await refreshIfNeeded(account.id);
    if (!token) return fail("Pinterest authorization expired. Reconnect the account in Integrations.");
    let board: PinterestBoard;
    try {
      board = await createBoard(token, { name: checked.name, privacy });
    } catch (err) {
      logger.warn({ err, accountId }, "pinterest board create failed");
      return fail(/\b(403|401)\b/.test(String(err)) ? "Pinterest didn't allow creating a board. Reconnect the account and accept the board permissions." : "Pinterest couldn't create the board. Try a different name.");
    }
    const meta = readMeta(account.metadata);
    const boards = [toChoice(board), ...(meta.boards ?? []).filter((b) => b.id !== board.id)].slice(0, MAX_CACHED);
    await patchMeta(account.id, { boards, boardsAt: new Date().toISOString(), ...(meta.boardId ? {} : { boardId: board.id, boardName: board.name }) });
    revalidatePath("/integrations");
    return ok<BoardChoice>(toChoice(board), `Board "${board.name}" created.`);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't create the board");
  }
}
