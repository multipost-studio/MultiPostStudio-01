/**
 * Google Business Profile Performance API Client.
 *
 * Official API: https://businessprofileperformance.googleapis.com/v1
 * Scope: https://www.googleapis.com/auth/business.manage
 *
 * Reports:
 * - Daily metrics (Search vs Maps impressions, website clicks, calls, directions, bookings)
 * - Monthly search keywords and their impression volumes
 */

export class GbpPerformanceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "GbpPerformanceError";
  }
}

export type GbpDailyMetricType =
  | "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH"
  | "BUSINESS_IMPRESSIONS_MOBILE_SEARCH"
  | "BUSINESS_IMPRESSIONS_DESKTOP_MAPS"
  | "BUSINESS_IMPRESSIONS_MOBILE_MAPS"
  | "WEBSITE_CLICKS"
  | "CALL_CLICKS"
  | "BUSINESS_DIRECTION_REQUESTS"
  | "BUSINESS_BOOKINGS";

export type GbpMetricTimeSeriesPoint = {
  date: string; // "YYYY-MM-DD"
  searchImpressions: number;
  mapsImpressions: number;
  totalImpressions: number;
  websiteClicks: number;
  callClicks: number;
  directionRequests: number;
  bookings: number;
};

export type GbpSearchKeywordItem = {
  keyword: string;
  insightsValue: number;
};

export type GbpAnalyticsSummary = {
  searchImpressions: number;
  mapsImpressions: number;
  totalImpressions: number;
  websiteClicks: number;
  callClicks: number;
  directionRequests: number;
  bookings: number;
  topKeywordsCount: number;
};

export type GbpAnalyticsDashboardData = {
  locationId: string;
  locationTitle: string;
  summary: GbpAnalyticsSummary;
  timeSeries: GbpMetricTimeSeriesPoint[];
  searchKeywords: GbpSearchKeywordItem[];
};

function formatPerfError(status: number, body: string): string {
  const detail = body.slice(0, 300);
  switch (status) {
    case 401:
      return "Google Business Profile authorization expired — reconnect";
    case 403:
      return `Google Business Profile Performance API access denied: ${detail}`;
    case 404:
      return "Location not found or has no Performance data";
    case 429:
      return "Google Business Profile Performance API quota exceeded — please retry later";
    default:
      return status >= 500
        ? `Google Business Profile Performance API is temporarily unavailable (${status})`
        : `Google Business Profile Performance error (${status}): ${detail}`;
  }
}

const PERFORMANCE_BASE = "https://businessprofileperformance.googleapis.com/v1";

type DateParam = { year: number; month: number; day: number };

function parseYmd(dateStr: string): DateParam {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { year: y, month: m, day: d };
}

/**
 * Fetches time series data for a single daily metric from the Performance API.
 */
async function fetchMetricSeries(
  accessToken: string,
  locationId: string,
  metric: GbpDailyMetricType,
  start: DateParam,
  end: DateParam,
): Promise<Map<string, number>> {
  const loc = locationId.replace(/^locations\//, "");
  const q = new URLSearchParams({
    dailyMetric: metric,
    "dailyRange.start_date.year": String(start.year),
    "dailyRange.start_date.month": String(start.month),
    "dailyRange.start_date.day": String(start.day),
    "dailyRange.end_date.year": String(end.year),
    "dailyRange.end_date.month": String(end.month),
    "dailyRange.end_date.day": String(end.day),
  });

  const url = `${PERFORMANCE_BASE}/locations/${loc}:getDailyMetricsTimeSeries?${q}`;
  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // If quota or access error, throw, but if 404 or empty, treat as empty map
    if (res.status === 404) return new Map();
    throw new GbpPerformanceError(res.status, formatPerfError(res.status, text));
  }

  const json = (await res.json()) as {
    timeSeries?: {
      datedValues?: Array<{
        date?: { year: number; month: number; day: number };
        value?: string | number;
      }>;
    };
  };

  const map = new Map<string, number>();
  const datedValues = json.timeSeries?.datedValues ?? [];
  for (const dv of datedValues) {
    if (dv.date) {
      const y = dv.date.year;
      const m = String(dv.date.month).padStart(2, "0");
      const d = String(dv.date.day).padStart(2, "0");
      const key = `${y}-${m}-${d}`;
      const val = Number(dv.value ?? 0);
      map.set(key, val);
    }
  }

  return map;
}

/**
 * Fetches monthly search keywords from the Performance API.
 */
export async function fetchGbpSearchKeywords(
  accessToken: string,
  locationId: string,
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number,
): Promise<GbpSearchKeywordItem[]> {
  const loc = locationId.replace(/^locations\//, "");
  const q = new URLSearchParams({
    "monthlyRange.start_month.year": String(startYear),
    "monthlyRange.start_month.month": String(startMonth),
    "monthlyRange.end_month.year": String(endYear),
    "monthlyRange.end_month.month": String(endMonth),
    pageSize: "100",
  });

  const url = `${PERFORMANCE_BASE}/locations/${loc}/searchkeywords/impressions/monthly?${q}`;
  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });

  if (!res.ok) {
    if (res.status === 404) return [];
    const text = await res.text().catch(() => "");
    throw new GbpPerformanceError(res.status, formatPerfError(res.status, text));
  }

  const json = (await res.json()) as {
    searchKeywordsCounts?: Array<{
      searchKeyword?: string;
      insightsValue?: { value?: string | number };
    }>;
  };

  const list = json.searchKeywordsCounts ?? [];
  return list
    .map((item) => ({
      keyword: item.searchKeyword ?? "",
      insightsValue: Number(item.insightsValue?.value ?? 0),
    }))
    .filter((k) => k.keyword.length > 0)
    .sort((a, b) => b.insightsValue - a.insightsValue);
}

/**
 * Fetches complete Google Business Profile Performance Analytics for a location
 * across a date range (startDate to endDate in YYYY-MM-DD format).
 */
export async function fetchGbpPerformanceDashboard(
  accessToken: string,
  locationId: string,
  locationTitle: string,
  startDate: string,
  endDate: string,
): Promise<GbpAnalyticsDashboardData> {
  const start = parseYmd(startDate);
  const end = parseYmd(endDate);

  // Fetch the 8 core metrics in parallel
  const [
    desktopSearch,
    mobileSearch,
    desktopMaps,
    mobileMaps,
    websiteClicks,
    calls,
    directions,
    bookings,
  ] = await Promise.all([
    fetchMetricSeries(accessToken, locationId, "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", start, end),
    fetchMetricSeries(accessToken, locationId, "BUSINESS_IMPRESSIONS_MOBILE_SEARCH", start, end),
    fetchMetricSeries(accessToken, locationId, "BUSINESS_IMPRESSIONS_DESKTOP_MAPS", start, end),
    fetchMetricSeries(accessToken, locationId, "BUSINESS_IMPRESSIONS_MOBILE_MAPS", start, end),
    fetchMetricSeries(accessToken, locationId, "WEBSITE_CLICKS", start, end),
    fetchMetricSeries(accessToken, locationId, "CALL_CLICKS", start, end),
    fetchMetricSeries(accessToken, locationId, "BUSINESS_DIRECTION_REQUESTS", start, end),
    fetchMetricSeries(accessToken, locationId, "BUSINESS_BOOKINGS", start, end),
  ]);

  // Also fetch search keywords (for the month span)
  const keywords = await fetchGbpSearchKeywords(
    accessToken,
    locationId,
    start.year,
    start.month,
    end.year,
    end.month,
  ).catch(() => []);

  // Collect all distinct dates
  const dateSet = new Set<string>();
  for (const m of [desktopSearch, mobileSearch, desktopMaps, mobileMaps, websiteClicks, calls, directions, bookings]) {
    for (const d of m.keys()) dateSet.add(d);
  }

  const sortedDates = Array.from(dateSet).sort();

  const timeSeries: GbpMetricTimeSeriesPoint[] = [];
  let sumSearch = 0;
  let sumMaps = 0;
  let sumWeb = 0;
  let sumCalls = 0;
  let sumDirections = 0;
  let sumBookings = 0;

  for (const date of sortedDates) {
    const sDesk = desktopSearch.get(date) ?? 0;
    const sMob = mobileSearch.get(date) ?? 0;
    const mDesk = desktopMaps.get(date) ?? 0;
    const mMob = mobileMaps.get(date) ?? 0;
    const searchImp = sDesk + sMob;
    const mapsImp = mDesk + mMob;
    const totalImp = searchImp + mapsImp;
    const web = websiteClicks.get(date) ?? 0;
    const cl = calls.get(date) ?? 0;
    const dir = directions.get(date) ?? 0;
    const bk = bookings.get(date) ?? 0;

    sumSearch += searchImp;
    sumMaps += mapsImp;
    sumWeb += web;
    sumCalls += cl;
    sumDirections += dir;
    sumBookings += bk;

    timeSeries.push({
      date,
      searchImpressions: searchImp,
      mapsImpressions: mapsImp,
      totalImpressions: totalImp,
      websiteClicks: web,
      callClicks: cl,
      directionRequests: dir,
      bookings: bk,
    });
  }

  const summary: GbpAnalyticsSummary = {
    searchImpressions: sumSearch,
    mapsImpressions: sumMaps,
    totalImpressions: sumSearch + sumMaps,
    websiteClicks: sumWeb,
    callClicks: sumCalls,
    directionRequests: sumDirections,
    bookings: sumBookings,
    topKeywordsCount: keywords.length,
  };

  return {
    locationId,
    locationTitle,
    summary,
    timeSeries,
    searchKeywords: keywords,
  };
}
