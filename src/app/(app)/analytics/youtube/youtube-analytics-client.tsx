"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/misc";
import { InlineEmpty } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/controls";
import { Button } from "@/components/ui/button";
import { AppLoader } from "@/components/ui/app-loader";
import { MultiLine, Bars, Donut } from "@/components/charts";
import { formatNumber } from "@/lib/utils";
import {
  getYouTubeAnalyticsAction,
  getYouTubeVideoAnalyticsAction,
  type YouTubeAnalyticsDashboard as DashboardData,
  type AnalyticsRangeKey,
} from "@/app/actions/youtube-analytics";

const RANGE_OPTIONS: { value: AnalyticsRangeKey; label: string }[] = [
  { value: "7", label: "7 days" },
  { value: "28", label: "28 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "365 days" },
];

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatMinutesWatched(minutes: number): string {
  if (minutes >= 60) return `${formatNumber(Math.round(minutes / 60))} hrs`;
  return `${formatNumber(Math.round(minutes))} min`;
}

type VideoSeries = { date: string; views: number; estimatedMinutesWatched: number; averageViewDuration: number; likes: number; comments: number };

export function YouTubeAnalyticsDashboard({
  accounts,
  selectedAccountId,
}: {
  accounts: { id: string; label: string }[];
  selectedAccountId: string;
}) {
  const [accountId, setAccountId] = React.useState(selectedAccountId);
  const [range, setRange] = React.useState<AnalyticsRangeKey | "custom">("28");
  const [customStart, setCustomStart] = React.useState("");
  const [customEnd, setCustomEnd] = React.useState("");
  const [data, setData] = React.useState<(DashboardData & { lastUpdatedAt: string }) | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [openVideoId, setOpenVideoId] = React.useState<string | null>(null);
  const [videoSeries, setVideoSeries] = React.useState<VideoSeries[] | null>(null);
  const [videoLoading, setVideoLoading] = React.useState(false);

  const load = React.useCallback(
    async (forceRefresh = false) => {
      setLoading(true);
      setError(null);
      const res = await getYouTubeAnalyticsAction(accountId, range, { customStart, customEnd, forceRefresh });
      if (res.ok && res.data) setData(res.data);
      else setError(res.error ?? "Failed to load analytics");
      setLoading(false);
    },
    [accountId, range, customStart, customEnd],
  );

  React.useEffect(() => {
    if (range === "custom" && (!customStart || !customEnd)) return;
    load();
  }, [load, range, customStart, customEnd]);

  async function openVideo(videoId: string) {
    if (openVideoId === videoId) {
      setOpenVideoId(null);
      setVideoSeries(null);
      return;
    }
    setOpenVideoId(videoId);
    setVideoSeries(null);
    setVideoLoading(true);
    const res = await getYouTubeVideoAnalyticsAction(accountId, videoId, range === "custom" ? "custom" : range, {
      customStart,
      customEnd,
    });
    setVideoSeries(res.ok && res.data ? res.data.series : []);
    setVideoLoading(false);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {accounts.length > 1 && (
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="h-9 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[13px] text-[var(--text)]"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        )}
        <Segmented value={range} onChange={setRange} options={[...RANGE_OPTIONS, { value: "custom", label: "Custom" }]} />
        {range === "custom" && (
          <>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="h-9 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[13px] text-[var(--text)]"
            />
            <span className="text-[13px] text-[var(--text-subtle)]">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="h-9 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[13px] text-[var(--text)]"
            />
          </>
        )}
        <Button size="sm" variant="secondary" disabled={loading} onClick={() => load(true)}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
        {data && (
          <span className="text-[13px] text-[var(--text-subtle)]">
            Last updated: {new Date(data.lastUpdatedAt).toLocaleString()}
          </span>
        )}
      </div>

      {error && (
        <div className="mt-4">
          <InlineEmpty title="Couldn't load YouTube Analytics" hint={error} />
        </div>
      )}

      {loading && !data && (
        <AppLoader
          variant="page"
          size="lg"
          state="thinking"
          text="Loading YouTube Analytics…"
          subtext="Fetching performance metrics, watch time, and channel telemetry"
        />
      )}

      {!error && data && (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Views" value={formatNumber(data.summary.views)} />
            <Stat label="Watch time" value={formatMinutesWatched(data.summary.estimatedMinutesWatched)} />
            <Stat label="Avg view duration" value={formatDuration(data.summary.averageViewDuration)} />
            <Stat
              label="Subscribers"
              value={`${data.summary.subscribersGained - data.summary.subscribersLost >= 0 ? "+" : ""}${formatNumber(
                data.summary.subscribersGained - data.summary.subscribersLost,
              )}`}
              hint={`${formatNumber(data.summary.subscribersGained)} gained · ${formatNumber(data.summary.subscribersLost)} lost`}
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Views &amp; watch time</CardTitle>
              </CardHeader>
              <CardContent>
                {data.timeSeries.length > 0 ? (
                  <MultiLine
                    data={data.timeSeries}
                    xKey="date"
                    lines={[
                      { key: "views", label: "Views" },
                      { key: "estimatedMinutesWatched", label: "Watch time (min)" },
                    ]}
                  />
                ) : (
                  <InlineEmpty title="No data in this range" hint="Try a wider date range." />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Subscriber growth</CardTitle>
              </CardHeader>
              <CardContent>
                {data.timeSeries.length > 0 ? (
                  <MultiLine
                    data={data.timeSeries}
                    xKey="date"
                    lines={[
                      { key: "subscribersGained", label: "Gained" },
                      { key: "subscribersLost", label: "Lost" },
                    ]}
                  />
                ) : (
                  <InlineEmpty title="No data in this range" hint="Try a wider date range." />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Top videos</CardTitle>
                <span className="text-[13px] text-[var(--text-muted)]">Click a video to see its daily trend</span>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {data.topVideos.length > 0 ? (
                  data.topVideos.map((v) => (
                    <div key={v.videoId}>
                      <button
                        onClick={() => openVideo(v.videoId)}
                        className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border)] p-2.5 text-left text-[13px] hover:border-[var(--primary)]"
                      >
                        <a
                          href={`https://www.youtube.com/watch?v=${v.videoId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="min-w-0 flex-1 truncate text-[var(--primary)] hover:underline"
                        >
                          {v.videoId}
                        </a>
                        <span className="shrink-0 tabular-nums text-[var(--text)]">{formatNumber(v.views)} views</span>
                        <span className="shrink-0 tabular-nums text-[var(--text-subtle)]">{formatMinutesWatched(v.estimatedMinutesWatched)}</span>
                      </button>
                      {openVideoId === v.videoId && (
                        <div className="mt-1.5 rounded-[var(--radius-md)] border border-[var(--border)] p-3">
                          {videoLoading ? (
                            <p className="text-[13px] text-[var(--text-subtle)]">Loading…</p>
                          ) : videoSeries && videoSeries.length > 0 ? (
                            <MultiLine
                              data={videoSeries}
                              xKey="date"
                              height={200}
                              lines={[
                                { key: "views", label: "Views" },
                                { key: "estimatedMinutesWatched", label: "Watch time (min)" },
                              ]}
                            />
                          ) : (
                            <InlineEmpty title="No data for this video in this range" />
                          )}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <InlineEmpty title="No videos in this range" hint="Publish or widen the date range." />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Traffic sources</CardTitle>
              </CardHeader>
              <CardContent>
                {data.trafficSources.length > 0 ? (
                  <Donut data={data.trafficSources.map((r) => ({ name: r.label, value: r.views }))} />
                ) : (
                  <InlineEmpty title="No data in this range" />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Geography</CardTitle>
              </CardHeader>
              <CardContent>
                {data.geography.length > 0 ? (
                  <Bars data={data.geography.slice(0, 10).map((r) => ({ label: r.label, views: r.views }))} dataKey="views" />
                ) : (
                  <InlineEmpty title="No data in this range" />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Devices</CardTitle>
              </CardHeader>
              <CardContent>
                {data.devices.length > 0 ? (
                  <Donut data={data.devices.map((r) => ({ name: r.label, value: r.views }))} />
                ) : (
                  <InlineEmpty title="No data in this range" />
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
