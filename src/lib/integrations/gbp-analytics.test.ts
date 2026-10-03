import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchGbpSearchKeywords,
  fetchGbpPerformanceDashboard,
} from "./gbp-analytics";

describe("GBP Performance API - Search Keywords", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and sorts search keyword impressions descending", async () => {
    const mockKeywordResponse = {
      searchKeywordsCounts: [
        { searchKeyword: "best coffee shop downtown", insightsValue: { value: "350" } },
        { searchKeyword: "espresso roasters near me", insightsValue: { value: "520" } },
        { searchKeyword: "cold brew delivery", insightsValue: { value: "110" } },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockKeywordResponse), { status: 200 }),
    );

    const keywords = await fetchGbpSearchKeywords(
      "test_access_token",
      "locations/99887766",
      2026,
      9,
      2026,
      9,
    );

    expect(keywords).toHaveLength(3);
    // Should be sorted highest to lowest impressions
    expect(keywords[0].keyword).toBe("espresso roasters near me");
    expect(keywords[0].insightsValue).toBe(520);
    expect(keywords[1].keyword).toBe("best coffee shop downtown");
    expect(keywords[1].insightsValue).toBe(350);
    expect(keywords[2].keyword).toBe("cold brew delivery");
    expect(keywords[2].insightsValue).toBe(110);
  });

  it("returns empty array when location has no keywords (404)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Not found", { status: 404 }),
    );

    const keywords = await fetchGbpSearchKeywords(
      "test_access_token",
      "locations/99887766",
      2026,
      9,
      2026,
      9,
    );

    expect(keywords).toEqual([]);
  });
});

describe("GBP Performance API - Complete Dashboard Aggregation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches all daily metrics and keywords, constructing dashboard summary and time series", async () => {
    // There are 8 metric series calls + 1 keywords call
    // Let's mock fetch to return appropriate data based on metric query param
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("searchkeywords")) {
        return new Response(
          JSON.stringify({
            searchKeywordsCounts: [
              { searchKeyword: "top store", insightsValue: { value: "100" } },
            ],
          }),
          { status: 200 },
        );
      }

      let val = 10;
      if (url.includes("DESKTOP_SEARCH")) val = 100;
      else if (url.includes("MOBILE_SEARCH")) val = 250;
      else if (url.includes("DESKTOP_MAPS")) val = 40;
      else if (url.includes("MOBILE_MAPS")) val = 60;
      else if (url.includes("WEBSITE_CLICKS")) val = 25;
      else if (url.includes("CALL_CLICKS")) val = 8;
      else if (url.includes("DIRECTION_REQUESTS")) val = 18;
      else if (url.includes("BOOKINGS")) val = 3;

      return new Response(
        JSON.stringify({
          timeSeries: {
            datedValues: [
              { date: { year: 2026, month: 9, day: 25 }, value: String(val) },
              { date: { year: 2026, month: 9, day: 26 }, value: String(val + 5) },
            ],
          },
        }),
        { status: 200 },
      );
    });

    const data = await fetchGbpPerformanceDashboard(
      "test_access_token",
      "locations/99887766",
      "Flagship Store",
      "2026-09-25",
      "2026-09-26",
    );

    expect(data.locationId).toBe("locations/99887766");
    expect(data.locationTitle).toBe("Flagship Store");
    // Search impressions = desktop (100 + 105) + mobile (250 + 255) = 205 + 505 = 710
    expect(data.summary.searchImpressions).toBe(710);
    // Maps impressions = desktop (40 + 45) + mobile (60 + 65) = 85 + 125 = 210
    expect(data.summary.mapsImpressions).toBe(210);
    expect(data.summary.totalImpressions).toBe(710 + 210);
    // Website clicks = 25 + 30 = 55
    expect(data.summary.websiteClicks).toBe(55);
    // Call clicks = 8 + 13 = 21
    expect(data.summary.callClicks).toBe(21);
    // Direction requests = 18 + 23 = 41
    expect(data.summary.directionRequests).toBe(41);
    // Bookings = 3 + 8 = 11
    expect(data.summary.bookings).toBe(11);

    // Time series has 2 points
    expect(data.timeSeries).toHaveLength(2);
    expect(data.timeSeries[0].date).toBe("2026-09-25");
    expect(data.timeSeries[1].date).toBe("2026-09-26");

    // Keywords
    expect(data.searchKeywords).toHaveLength(1);
    expect(data.searchKeywords[0].keyword).toBe("top store");
  });
});
