import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: { postChannel: { findMany: vi.fn() } } }));
vi.mock("@/lib/entitlements", () => ({ orgEntitlements: vi.fn() }));

import { planBlockedChannels } from "./plan-gates";
import { db } from "@/lib/db";
import { orgEntitlements } from "@/lib/entitlements";

const row = (channelId: string, platform: string) => ({ channelId, platform, post: { workspace: { orgId: "org1" } } });

beforeEach(() => vi.clearAllMocks());

describe("planBlockedChannels", () => {
  it("blocks a channel whose network the plan no longer includes, naming the network", async () => {
    vi.mocked(db.postChannel.findMany).mockResolvedValue([row("c1", "instagram"), row("c2", "pinterest")] as never);
    vi.mocked(orgEntitlements).mockResolvedValue(new Set(["platform_instagram", "platform_x"]));
    const blocked = await planBlockedChannels("post1");
    expect([...blocked.keys()]).toEqual(["c2"]);
    expect(blocked.get("c2")).toMatch(/doesn't include publishing to Pinterest/);
  });

  it("lets everything through when the plan covers every network in the post", async () => {
    vi.mocked(db.postChannel.findMany).mockResolvedValue([row("c1", "instagram"), row("c2", "linkedin")] as never);
    vi.mocked(orgEntitlements).mockResolvedValue(new Set(["platform_instagram", "platform_linkedin"]));
    expect((await planBlockedChannels("post1")).size).toBe(0);
  });

  it("a post with no channels has nothing to block (and costs no entitlement lookup)", async () => {
    vi.mocked(db.postChannel.findMany).mockResolvedValue([] as never);
    expect((await planBlockedChannels("post1")).size).toBe(0);
    expect(orgEntitlements).not.toHaveBeenCalled();
  });

  it("checks against the owning org's plan, read from the post's own workspace (not from the caller)", async () => {
    vi.mocked(db.postChannel.findMany).mockResolvedValue([row("c1", "instagram")] as never);
    vi.mocked(orgEntitlements).mockResolvedValue(new Set());
    await planBlockedChannels("post1");
    expect(orgEntitlements).toHaveBeenCalledWith("org1");
    expect(db.postChannel.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { postId: "post1" } }));
  });

  it("an unknown network is blocked rather than allowed by default", async () => {
    vi.mocked(db.postChannel.findMany).mockResolvedValue([row("c1", "myspace")] as never);
    vi.mocked(orgEntitlements).mockResolvedValue(new Set(["platform_instagram"]));
    expect((await planBlockedChannels("post1")).get("c1")).toMatch(/myspace/);
  });
});
