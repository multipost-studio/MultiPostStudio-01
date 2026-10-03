import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchGbpAccounts,
  fetchGbpLocations,
  publishGbpLocalPost,
} from "./gbp";
import { PROVIDERS } from "../social/providers";

describe("Google Business Profile Provider & OAuth Configuration", () => {
  it("registers gbp provider with required OAuth scopes and URLs", () => {
    const provider = PROVIDERS.gbp;
    expect(provider).toBeDefined();
    expect(provider?.key).toBe("gbp");
    expect(provider?.authorizeUrl).toContain("accounts.google.com");
    expect(provider?.tokenUrl).toContain("oauth2.googleapis.com/token");
    expect(provider?.scopes).toContain("https://www.googleapis.com/auth/business.manage");
  });
});

describe("GBP Account Discovery", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and parses business profile accounts", async () => {
    const mockAccounts = {
      accounts: [
        {
          name: "accounts/11223344",
          accountName: "Acme Business Group",
          type: "ORGANIZATION",
          role: "OWNER",
        },
        {
          name: "accounts/55667788",
          accountName: "Global Stores Inc",
          type: "PERSONAL",
          role: "MANAGER",
        },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockAccounts), { status: 200 }),
    );

    const accounts = await fetchGbpAccounts("test_access_token");
    expect(accounts).toHaveLength(2);
    expect(accounts[0].name).toBe("accounts/11223344");
    expect(accounts[0].accountName).toBe("Acme Business Group");
    expect(accounts[1].name).toBe("accounts/55667788");
  });

  it("handles empty account responses gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    const accounts = await fetchGbpAccounts("test_access_token");
    expect(accounts).toEqual([]);
  });

  it("throws descriptive error when Google Account API returns 401", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Invalid credentials" } }), { status: 401 }),
    );

    await expect(fetchGbpAccounts("expired_token")).rejects.toThrow(
      "Google Business Profile authorization expired — reconnect",
    );
  });
});

describe("GBP Location Discovery", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and extracts location information correctly", async () => {
    const mockLocations = {
      locations: [
        {
          name: "locations/99887766",
          title: "Acme Flagship Store - Downtown",
          storeCode: "STORE-01",
          storefrontAddress: {
            addressLines: ["123 Main St", "Suite 400"],
            locality: "New York",
            administrativeArea: "NY",
            postalCode: "10001",
            regionCode: "US",
          },
          phoneNumbers: {
            primaryPhone: "+1 212 555 0199",
          },
          websiteUri: "https://acme.example.com",
          categories: {
            primaryCategory: {
              displayName: "Coffee Shop",
            },
          },
        },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockLocations), { status: 200 }),
    );

    const locations = await fetchGbpLocations("test_access_token", "accounts/11223344");
    expect(locations).toHaveLength(1);
    expect(locations[0].name).toBe("locations/99887766");
    expect(locations[0].title).toBe("Acme Flagship Store - Downtown");
    expect(locations[0].storeCode).toBe("STORE-01");
    expect(locations[0].storefrontAddress?.locality).toBe("New York");
    expect(locations[0].phoneNumbers?.primaryPhone).toBe("+1 212 555 0199");
    expect(locations[0].websiteUri).toBe("https://acme.example.com");
    expect(locations[0].categories?.primaryCategory?.displayName).toBe("Coffee Shop");
  });
});

describe("GBP Local Post Publishing", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("publishes a STANDARD update post with photo and CTA", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          name: "accounts/11223344/locations/99887766/localPosts/post_12345",
          searchUrl: "https://local.google.com/post_12345",
          state: "LIVE",
        }),
        { status: 200 },
      ),
    );

    const result = await publishGbpLocalPost(
      "test_access_token",
      "accounts/11223344",
      "locations/99887766",
      {
        summary: "Check out our weekend fresh arrivals!",
        topicType: "STANDARD",
        media: [
          {
            mediaFormat: "PHOTO",
            sourceUrl: "https://cdn.example.com/photo.jpg",
          },
        ],
        callToAction: {
          actionType: "LEARN_MORE",
          url: "https://example.com/weekend-sale",
        },
      },
    );

    expect(result.name).toBe("accounts/11223344/locations/99887766/localPosts/post_12345");
    expect(result.searchUrl).toBe("https://local.google.com/post_12345");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://mybusiness.googleapis.com/v4/accounts/11223344/locations/99887766/localPosts",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer test_access_token",
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          summary: "Check out our weekend fresh arrivals!",
          topicType: "STANDARD",
          media: [
            {
              mediaFormat: "PHOTO",
              sourceUrl: "https://cdn.example.com/photo.jpg",
            },
          ],
          callToAction: {
            actionType: "LEARN_MORE",
            url: "https://example.com/weekend-sale",
          },
        }),
      }),
    );
  });

  it("publishes an EVENT post with schedule", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          name: "accounts/11223344/locations/99887766/localPosts/event_999",
          searchUrl: "https://local.google.com/event_999",
        }),
        { status: 200 },
      ),
    );

    const result = await publishGbpLocalPost(
      "test_access_token",
      "accounts/11223344",
      "locations/99887766",
      {
        summary: "Join our annual spring festival!",
        topicType: "EVENT",
        event: {
          title: "Spring Festival 2026",
          schedule: {
            startDate: { year: 2026, month: 5, day: 10 },
            startTime: { hours: 10, minutes: 0, seconds: 0, nanos: 0 },
            endDate: { year: 2026, month: 5, day: 12 },
            endTime: { hours: 18, minutes: 0, seconds: 0, nanos: 0 },
          },
        },
      },
    );

    expect(result.name).toBe("accounts/11223344/locations/99887766/localPosts/event_999");
    const sentBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(sentBody.topicType).toBe("EVENT");
    expect(sentBody.event.title).toBe("Spring Festival 2026");
    expect(sentBody.event.schedule.startDate.year).toBe(2026);
  });

  it("publishes an OFFER post with coupon code and terms", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          name: "accounts/11223344/locations/99887766/localPosts/offer_777",
          searchUrl: "https://local.google.com/offer_777",
        }),
        { status: 200 },
      ),
    );

    const result = await publishGbpLocalPost(
      "test_access_token",
      "accounts/11223344",
      "locations/99887766",
      {
        summary: "Get 20% off your entire order this week!",
        topicType: "OFFER",
        event: {
          title: "20% Off Spring Special",
          schedule: {
            startDate: { year: 2026, month: 4, day: 1 },
            endDate: { year: 2026, month: 4, day: 7 },
          },
        },
        offer: {
          couponCode: "SPRING20",
          redeemOnlineUrl: "https://example.com/redeem",
          termsConditions: "Valid on in-store and online orders over $50.",
        },
      },
    );

    expect(result.name).toBe("accounts/11223344/locations/99887766/localPosts/offer_777");
    const sentBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(sentBody.topicType).toBe("OFFER");
    expect(sentBody.offer.couponCode).toBe("SPRING20");
    expect(sentBody.offer.termsConditions).toContain("Valid on in-store");
  });

  it("maps 403 quota errors and permission errors accurately", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: 403,
            message: "The caller does not have permission for this location",
            status: "PERMISSION_DENIED",
          },
        }),
        { status: 403 },
      ),
    );

    await expect(
      publishGbpLocalPost("test_access_token", "accounts/11223344", "locations/99887766", {
        summary: "Test",
        topicType: "STANDARD",
      }),
    ).rejects.toThrow("Google Business Profile access denied: The caller does not have permission for this location");
  });
});
