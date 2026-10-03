import { describe, it, expect, vi, beforeEach } from "vitest";
import { getGbpLocationsAction, saveGbpLocationsAction } from "./gbp-locations";
import { db } from "@/lib/db";
import { withPermission, ensureInWorkspace, limitGuard } from "./_helpers";
import { refreshIfNeeded } from "@/lib/social/oauth";
import * as gbpApi from "@/lib/integrations/gbp";

vi.mock("./_helpers", () => ({
  withPermission: vi.fn(),
  ensureInWorkspace: vi.fn(),
  limitGuard: vi.fn(),
  ok: (data?: unknown, message?: string) => ({ ok: true, data, message }),
  fail: (error: string) => ({ ok: false, error }),
}));

vi.mock("@/lib/social/oauth", () => ({
  refreshIfNeeded: vi.fn(),
}));

vi.mock("@/lib/integrations/gbp", () => ({
  fetchGbpAllLocations: vi.fn(),
}));

vi.mock("@/lib/adapters/billing", () => ({
  bumpUsage: vi.fn(),
  debumpUsage: vi.fn(),
}));

vi.mock("@/lib/events", () => ({
  logActivity: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    socialAccount: { findUnique: vi.fn(), update: vi.fn() },
    socialChannel: { count: vi.fn(), create: vi.fn(), delete: vi.fn() },
    postChannel: { count: vi.fn() },
    queueSlot: { create: vi.fn() },
  },
}));

const CTX = {
  active: {
    workspace: { id: "ws_test" },
    org: { id: "org_test" },
    permissions: ["channels.connect"],
  },
  user: { id: "user_test" },
};

describe("getGbpLocationsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(withPermission).mockResolvedValue(CTX as never);
    vi.mocked(ensureInWorkspace).mockResolvedValue(undefined as never);
    vi.mocked(refreshIfNeeded).mockResolvedValue("fresh_token");
  });

  it("fails if account is not in the active workspace", async () => {
    vi.mocked(ensureInWorkspace).mockRejectedValueOnce(new Error("Unauthorized access"));
    const res = await getGbpLocationsAction("acc_gbp_1");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("Unauthorized access");
  });

  it("fails if account is not a Google Business Profile account", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValueOnce({
      id: "acc_gbp_1",
      platform: "facebook",
      channels: [],
    } as never);

    const res = await getGbpLocationsAction("acc_gbp_1");
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Google Business Profile account not found");
  });

  it("fails if token refresh fails", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValueOnce({
      id: "acc_gbp_1",
      platform: "gbp",
      channels: [],
    } as never);
    vi.mocked(refreshIfNeeded).mockResolvedValueOnce(null);

    const res = await getGbpLocationsAction("acc_gbp_1");
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Google authorization expired");
  });

  it("successfully discovers and formats locations with connection status", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValueOnce({
      id: "acc_gbp_1",
      platform: "gbp",
      handle: "owner@example.com",
      displayName: "Owner",
      channels: [{ id: "chan_1", handle: "locations/loc_1", name: "Loc 1" }],
    } as never);

    vi.mocked(gbpApi.fetchGbpAllLocations).mockResolvedValueOnce({
      accounts: [{ name: "accounts/acc_1", accountName: "Business 1", type: "ORGANIZATION", role: "OWNER" }],
      locations: [
        {
          name: "locations/loc_1",
          title: "Loc 1",
          accountName: "accounts/acc_1",
          accountTitle: "Business 1",
        },
        {
          name: "locations/loc_2",
          title: "Loc 2",
          accountName: "accounts/acc_1",
          accountTitle: "Business 1",
        },
      ],
    });

    const res = await getGbpLocationsAction("acc_gbp_1");
    expect(res.ok).toBe(true);
    expect(res.data?.locations).toHaveLength(2);
    // loc_1 is already connected
    expect(res.data?.locations[0].connected).toBe(true);
    expect(res.data?.locations[0].channelId).toBe("chan_1");
    // loc_2 is not connected
    expect(res.data?.locations[1].connected).toBe(false);
    expect(res.data?.locations[1].channelId).toBeUndefined();
  });
});

describe("saveGbpLocationsAction", () => {
  const MOCK_ACCOUNT = {
    id: "acc_gbp_1",
    platform: "gbp",
    workspaceId: "ws_test",
    metadata: JSON.stringify({
      locations: [
        {
          name: "locations/loc_1",
          title: "Loc 1",
          accountName: "accounts/acc_1",
          accountTitle: "Business 1",
        },
        {
          name: "locations/loc_2",
          title: "Loc 2",
          accountName: "accounts/acc_1",
          accountTitle: "Business 1",
        },
      ],
    }),
    channels: [
      { id: "chan_1", handle: "locations/loc_1", name: "Loc 1" },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(withPermission).mockResolvedValue(CTX as never);
    vi.mocked(ensureInWorkspace).mockResolvedValue(undefined as never);
    vi.mocked(limitGuard).mockResolvedValue(null);
  });

  it("prevents disconnecting a location with scheduled posts", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValueOnce(MOCK_ACCOUNT as never);
    // User submits empty selection -> wants to disconnect chan_1
    vi.mocked(db.postChannel.count).mockResolvedValueOnce(2);

    const res = await saveGbpLocationsAction("acc_gbp_1", []);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("it has 2 scheduled post(s)");
  });

  it("respects org channel quota limit", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValueOnce(MOCK_ACCOUNT as never);
    vi.mocked(db.socialChannel.count).mockResolvedValueOnce(10);
    vi.mocked(limitGuard).mockResolvedValueOnce({ ok: false, error: "Channel limit reached" } as never);

    const res = await saveGbpLocationsAction("acc_gbp_1", ["locations/loc_1", "locations/loc_2"]);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("Channel limit reached");
  });

  it("creates new channel and seeds default queue slots", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValueOnce(MOCK_ACCOUNT as never);
    vi.mocked(db.socialChannel.count).mockResolvedValueOnce(1);
    vi.mocked(db.socialChannel.create).mockResolvedValueOnce({
      id: "chan_2",
      name: "Loc 2",
      handle: "locations/loc_2",
      platform: "gbp",
    } as never);

    const res = await saveGbpLocationsAction("acc_gbp_1", ["locations/loc_1", "locations/loc_2"]);
    expect(res.ok).toBe(true);
    expect(db.socialChannel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: "ws_test",
          platform: "gbp",
          name: "Loc 2",
          handle: "locations/loc_2",
        }),
      }),
    );
    // Queue slots Mon/Wed/Fri (3 days * 2 slots = 6)
    expect(db.queueSlot.create).toHaveBeenCalledTimes(6);
  });
});
