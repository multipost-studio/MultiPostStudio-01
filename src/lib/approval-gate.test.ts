import { describe, it, expect, vi, beforeEach } from "vitest";
import { approvalBlockReason, contentFingerprint, evaluateApproval, APPROVAL_REQUIRED_PREFIX } from "./approval-gate";
import { db } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  db: { post: { findUnique: vi.fn() }, approvalRequest: { findMany: vi.fn() } },
}));

const channels = [
  { platform: "instagram", body: "Hello world" },
  { platform: "x", body: "Hello X" },
];
const approved = (chs = channels) => ({ status: "approved", approvedSnapshot: JSON.stringify({ approvedAt: "2026-01-01", channels: chs }) });

describe("contentFingerprint", () => {
  it("ignores channel order and nothing else", () => {
    expect(contentFingerprint(channels)).toBe(contentFingerprint([...channels].reverse()));
    expect(contentFingerprint(channels)).not.toBe(contentFingerprint([{ platform: "instagram", body: "Hello world!" }, channels[1]]));
    expect(contentFingerprint(channels)).not.toBe(contentFingerprint([channels[0]]));
  });
});

describe("evaluateApproval", () => {
  it("never blocks while approval is optional, whatever the post's history", () => {
    for (const latest of [null, { status: "rejected", approvedSnapshot: null }, { status: "in_review", approvedSnapshot: null }]) {
      expect(evaluateApproval({ requireApproval: false, latest, channels })).toBeNull();
    }
  });

  it("blocks a post that was never sent for approval", () => {
    expect(evaluateApproval({ requireApproval: true, latest: null, channels })).toMatch(/Send this post for approval/);
  });

  it("allows a post whose approved text still matches what it says now", () => {
    expect(evaluateApproval({ requireApproval: true, latest: approved(), channels })).toBeNull();
    expect(evaluateApproval({ requireApproval: true, latest: approved([...channels].reverse()), channels })).toBeNull();
  });

  it("blocks a post edited after approval", () => {
    const edited = [{ platform: "instagram", body: "Something else entirely" }, channels[1]];
    expect(evaluateApproval({ requireApproval: true, latest: approved(), channels: edited })).toMatch(/edited after it was approved/);
  });

  it("blocks a post that gained a channel after approval", () => {
    const more = [...channels, { platform: "linkedin", body: "New channel" }];
    expect(evaluateApproval({ requireApproval: true, latest: approved(), channels: more })).toMatch(/edited after/);
  });

  it("trusts the status of an approval recorded before snapshots existed", () => {
    expect(evaluateApproval({ requireApproval: true, latest: { status: "approved", approvedSnapshot: null }, channels })).toBeNull();
    expect(evaluateApproval({ requireApproval: true, latest: { status: "approved", approvedSnapshot: "not json" }, channels })).toBeNull();
  });

  it.each([
    ["in_review", /still waiting/],
    ["changes_requested", /Changes were requested/],
    ["rejected", /rejected or reset/],
    ["something_new", /rejected or reset/],
  ])("blocks a post whose latest request is %s", (status, message) => {
    const reason = evaluateApproval({ requireApproval: true, latest: { status, approvedSnapshot: null }, channels })!;
    expect(reason).toMatch(message);
    expect(reason.startsWith(APPROVAL_REQUIRED_PREFIX)).toBe(true);
  });
});

describe("approvalBlockReason", () => {
  beforeEach(() => {
    vi.mocked(db.post.findUnique).mockReset();
    vi.mocked(db.approvalRequest.findMany).mockReset().mockResolvedValue([]);
  });

  it("loads the setting and text, and does nothing more while approval is optional", async () => {
    vi.mocked(db.post.findUnique).mockResolvedValue({ workspace: { requireApproval: false }, channels } as never);
    expect(await approvalBlockReason("p1")).toBeNull();
    expect(db.approvalRequest.findMany).not.toHaveBeenCalled();
  });

  it("uses what the caller already loaded and reads nothing for the post", async () => {
    expect(await approvalBlockReason("p1", { requireApproval: false, channels })).toBeNull();
    expect(db.post.findUnique).not.toHaveBeenCalled();
  });

  it("asks for the latest request only when approval is required", async () => {
    vi.mocked(db.post.findUnique).mockResolvedValue({ workspace: { requireApproval: true }, channels } as never);
    expect(await approvalBlockReason("p1")).toMatch(/requires approval/);
    expect(vi.mocked(db.approvalRequest.findMany).mock.calls[0][0]).toMatchObject({ where: { postId: "p1" }, orderBy: { createdAt: "desc" }, take: 1 });
  });

  it("passes when the latest request is approved for the current text", async () => {
    vi.mocked(db.post.findUnique).mockResolvedValue({ workspace: { requireApproval: true }, channels } as never);
    vi.mocked(db.approvalRequest.findMany).mockResolvedValue([approved()] as never);
    expect(await approvalBlockReason("p1")).toBeNull();
  });

  it("does not block a post that no longer exists (the caller reports that itself)", async () => {
    vi.mocked(db.post.findUnique).mockResolvedValue(null);
    expect(await approvalBlockReason("gone")).toBeNull();
  });
});
