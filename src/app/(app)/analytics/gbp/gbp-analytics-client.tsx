"use client";

import * as React from "react";
import {
  Search,
  MapPin,
  Globe,
  Phone,
  Navigation,
  CalendarCheck,
  RefreshCw,
  Building2,
  AlertCircle,
  Eye,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppLoader } from "@/components/ui/app-loader";
import { MultiLine, Donut } from "@/components/charts";
import { formatNumber, relativeTime } from "@/lib/utils";
import {
  getGbpAnalyticsAction,
  type GbpAnalyticsRangeKey,
} from "@/app/actions/gbp-analytics";
import type { GbpAnalyticsDashboardData } from "@/lib/integrations/gbp-analytics";

const RANGE_OPTIONS: { value: GbpAnalyticsRangeKey; label: string }[] = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "28", label: "28 days" },
  { value: "90", label: "90 days" },
];

export function GbpAnalyticsDashboard({
  accounts,
  locations,
  initialAccountId,
  initialLocationId,
}: {
  accounts: { id: string; label: string }[];
  locations: {
    accountId: string;
    accountLabel: string;
    locationId: string;
    locationName: string;
  }[];
  initialAccountId: string;
  initialLocationId: string;
}) {
  const [selectedLocKey, setSelectedLocKey] = React.useState(
    `${initialAccountId}:::${initialLocationId}`,
  );
  const [range, setRange] = React.useState<GbpAnalyticsRangeKey | "custom">("28");
  const [customStart, setCustomStart] = React.useState("");
  const [customEnd, setCustomEnd] = React.useState("");

  const [data, setData] = React.useState<
    (GbpAnalyticsDashboardData & { lastUpdatedAt: string; isCached: boolean }) | null
  >(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [accountId, locationId] = React.useMemo(() => {
    const parts = selectedLocKey.split(":::");
    return [parts[0] || initialAccountId, parts[1] || initialLocationId];
  }, [selectedLocKey, initialAccountId, initialLocationId]);

  const loadData = React.useCallback(
    async (forceRefresh = false) => {
      if (!accountId || !locationId) return;
      if (forceRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const res = await getGbpAnalyticsAction(accountId, locationId, range, {
        customStart: range === "custom" ? customStart : undefined,
        customEnd: range === "custom" ? customEnd : undefined,
        forceRefresh,
      });

      setLoading(false);
      setRefreshing(false);

      if (res.ok && res.data) {
        setData(res.data);
      } else {
        setError(res.error ?? "Failed to load Google Business Profile analytics");
      }
    },
    [accountId, locationId, range, customStart, customEnd],
  );

  React.useEffect(() => {
    if (range === "custom" && (!customStart || !customEnd)) return;
    loadData(false);
  }, [loadData, range, customStart, customEnd]);

  // Transform data for line charts
  const timeSeriesData = React.useMemo(() => {
    if (!data?.timeSeries) return [];
    return data.timeSeries.map((p) => ({
      label: p.date.slice(5), // "MM-DD"
      date: p.date,
      search: p.searchImpressions,
      maps: p.mapsImpressions,
      total: p.totalImpressions,
      website: p.websiteClicks,
      calls: p.callClicks,
      directions: p.directionRequests,
      bookings: p.bookings,
    }));
  }, [data]);

  const searchVsMapsDonut = React.useMemo(() => {
    if (!data?.summary) return [];
    return [
      {
        name: "Google Search",
        value: data.summary.searchImpressions,
        color: "#4285F4",
      },
      {
        name: "Google Maps",
        value: data.summary.mapsImpressions,
        color: "#34A853",
      },
    ];
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Filters and Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Location selector */}
          <div className="flex items-center gap-1.5">
            <Building2 size={16} className="text-[var(--primary)] shrink-0" />
            <select
              value={selectedLocKey}
              onChange={(e) => setSelectedLocKey(e.target.value)}
              className="h-9 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[13px] font-medium text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
            >
              {locations.map((loc) => (
                <option
                  key={`${loc.accountId}:::${loc.locationId}`}
                  value={`${loc.accountId}:::${loc.locationId}`}
                >
                  {loc.locationName} ({loc.accountLabel})
                </option>
              ))}
            </select>
          </div>

          {/* Range buttons */}
          <div className="flex items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-sunken)] p-0.5">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRange(opt.value)}
                className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-[12px] font-medium transition-all ${
                  range === opt.value
                    ? "bg-[var(--surface)] text-[var(--text)] shadow-xs"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                {opt.label}
              </button>
            ))}
            <button
              onClick={() => setRange("custom")}
              className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-[12px] font-medium transition-all ${
                range === "custom"
                  ? "bg-[var(--surface)] text-[var(--text)] shadow-xs"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              Custom
            </button>
          </div>

          {range === "custom" && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="h-8 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 text-[12px] text-[var(--text)]"
              />
              <span className="text-[12px] text-[var(--text-subtle)]">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-8 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 text-[12px] text-[var(--text)]"
              />
            </div>
          )}
        </div>

        {/* Sync status & Refresh button */}
        <div className="flex items-center gap-2.5">
          {data && (
            <div className="flex items-center gap-2 text-[11.5px] text-[var(--text-subtle)]">
              <Badge tone={data.isCached ? "neutral" : "success"}>
                {data.isCached ? "Cached" : "Live"}
              </Badge>
              <span>Updated {relativeTime(new Date(data.lastUpdatedAt))}</span>
            </div>
          )}

          <Button
            variant="secondary"
            size="sm"
            loading={refreshing}
            onClick={() => loadData(true)}
            title="Refresh directly from Google Performance API"
          >
            <RefreshCw size={13} className="mr-1.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <AppLoader
          variant="section"
          size="md"
          state="thinking"
          text="Loading Google Business Profile performance metrics…"
          subtext="Fetching daily impressions, actions, and keyword volumes from Google API"
        />
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="rounded-[var(--radius-md)] border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-4 text-[13px] text-[var(--danger)]">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Unable to load Google Business Profile metrics</p>
              <p className="mt-0.5 text-[var(--text-muted)]">{error}</p>
              <Button
                size="sm"
                variant="secondary"
                className="mt-3"
                onClick={() => loadData(true)}
              >
                <RefreshCw size={13} className="mr-1.5" /> Retry Now
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Analytics Dashboard Content */}
      {!loading && !error && data && (
        <>
          {/* Stat Cards Overview */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Card>
              <CardContent className="pt-4">
                <Stat
                  label="Search Views"
                  value={formatNumber(data.summary.searchImpressions)}
                  hint="Google Search impressions"
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <Stat
                  label="Maps Views"
                  value={formatNumber(data.summary.mapsImpressions)}
                  hint="Google Maps impressions"
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <Stat
                  label="Website Clicks"
                  value={formatNumber(data.summary.websiteClicks)}
                  hint="Visits to your website"
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <Stat
                  label="Phone Calls"
                  value={formatNumber(data.summary.callClicks)}
                  hint="Calls from listing"
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <Stat
                  label="Directions"
                  value={formatNumber(data.summary.directionRequests)}
                  hint="Route requests to location"
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <Stat
                  label="Bookings"
                  value={formatNumber(data.summary.bookings)}
                  hint="Completed reservations"
                />
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Chart 1: Impressions Over Time */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-[14px] flex items-center justify-between">
                  <span>Performance Over Time (Search vs. Maps)</span>
                  <span className="text-[12px] font-normal text-[var(--text-subtle)]">
                    Total: {formatNumber(data.summary.totalImpressions)} views
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {timeSeriesData.length > 0 ? (
                  <MultiLine
                    data={timeSeriesData}
                    xKey="label"
                    lines={[
                      { key: "search", label: "Search Views", color: "#4285F4" },
                      { key: "maps", label: "Maps Views", color: "#34A853" },
                    ]}
                  />
                ) : (
                  <p className="py-12 text-center text-[13px] text-[var(--text-subtle)]">
                    No timeline data recorded by Google for this date range.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Chart 2: Search vs. Maps Share */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-[14px]">Search vs. Maps Share</CardTitle>
              </CardHeader>
              <CardContent>
                {data.summary.totalImpressions > 0 ? (
                  <Donut data={searchVsMapsDonut} />
                ) : (
                  <p className="py-12 text-center text-[13px] text-[var(--text-subtle)]">
                    No impression data to display.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Customer Actions Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[14px] flex items-center justify-between">
                <span>Customer Actions Over Time</span>
                <span className="text-[12px] font-normal text-[var(--text-subtle)]">
                  Website Clicks, Phone Calls, and Direction Requests
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {timeSeriesData.length > 0 ? (
                <MultiLine
                  data={timeSeriesData}
                  xKey="label"
                  lines={[
                    { key: "website", label: "Website Clicks", color: "#EA4335" },
                    { key: "calls", label: "Calls", color: "#FBBC05" },
                    { key: "directions", label: "Directions", color: "#34A853" },
                    { key: "bookings", label: "Bookings", color: "#9333EA" },
                  ]}
                />
              ) : (
                <p className="py-12 text-center text-[13px] text-[var(--text-subtle)]">
                  No action data recorded by Google for this date range.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Top Search Keywords Table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[14px] flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Search size={15} className="text-[var(--primary)]" />
                  Top Search Keywords
                </span>
                <span className="text-[12px] font-normal text-[var(--text-subtle)]">
                  {data.searchKeywords.length} query terms
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.searchKeywords.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[13px]">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                        <th className="py-2.5 px-3 w-12">#</th>
                        <th className="py-2.5 px-3">Search Query</th>
                        <th className="py-2.5 px-3 text-right">Search Impressions</th>
                        <th className="py-2.5 px-3 text-right w-44">Share</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {data.searchKeywords.map((item, idx) => {
                        const maxVal = Math.max(
                          ...data.searchKeywords.map((k) => k.insightsValue),
                          1,
                        );
                        const pct = Math.round((item.insightsValue / maxVal) * 100);

                        return (
                          <tr
                            key={item.keyword}
                            className="hover:bg-[var(--surface-hover)] transition-colors"
                          >
                            <td className="py-2 px-3 text-[var(--text-subtle)] font-mono text-[11px]">
                              {idx + 1}
                            </td>
                            <td className="py-2 px-3 font-medium text-[var(--text)]">
                              {item.keyword}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums font-semibold text-[var(--text)]">
                              {formatNumber(item.insightsValue)}
                            </td>
                            <td className="py-2 px-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="h-1.5 w-24 bg-[var(--bg-sunken)] rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-[var(--primary)] rounded-full"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="text-[11px] tabular-nums text-[var(--text-subtle)] w-8">
                                  {pct}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center text-[13px] text-[var(--text-subtle)]">
                  <p className="font-medium text-[var(--text)]">No search keywords available yet</p>
                  <p className="text-[12px] mt-1 max-w-md mx-auto">
                    Google Business Profile privacy rules only disclose queries that have been searched by at least 10 people in a calendar month.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
