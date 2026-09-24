"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  REPORT_WIDGETS_METADATA,
  getDefaultReportConfig,
  type CustomReportConfig,
  type ReportWidgetKey,
} from "@/lib/report-builder";
import { saveCustomReportAction } from "@/app/actions/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/controls";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import {
  LayoutGrid,
  Columns,
  Sparkles,
  Save,
  CheckCircle2,
  Calendar,
  Layers,
  BarChart3,
  Globe,
  Share2,
} from "lucide-react";

export function ReportBuilderClient({
  workspaceName,
  channels,
  isWhiteLabelEntitled,
}: {
  workspaceName: string;
  channels: { id: string; name: string; platform: string }[];
  isWhiteLabelEntitled: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(`Performance Report — ${workspaceName}`);
  const [schedule, setSchedule] = useState<"none" | "weekly" | "monthly">("none");
  const [config, setConfig] = useState<CustomReportConfig>(getDefaultReportConfig());

  const handleToggleWidget = (key: ReportWidgetKey) => {
    setConfig((prev) => {
      const exists = prev.widgets.includes(key);
      const nextWidgets = exists
        ? prev.widgets.filter((w) => w !== key)
        : [...prev.widgets, key];
      return { ...prev, widgets: nextWidgets };
    });
  };

  const handleSave = () => {
    if (!name.trim()) {
      toast({ title: "Please name your report", tone: "error" });
      return;
    }
    if (config.widgets.length === 0) {
      toast({ title: "Please select at least one widget", tone: "error" });
      return;
    }

    startTransition(async () => {
      const res = await saveCustomReportAction(name, config, schedule);
      if (res.ok) {
        toast({ title: "Report created successfully", tone: "success" });
        router.push("/reports");
        router.refresh();
      } else {
        toast({ title: res.error || "Failed to save report", tone: "error" });
      }
    });
  };

  const selectedRangeDays = {
    last_7_days: 7,
    last_30_days: 30,
    last_90_days: 90,
    this_month: 30,
  }[config.dateRange];

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left Configuration Panel */}
      <div className="space-y-6 lg:col-span-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[15px]">
              <Layers size={16} className="text-[var(--primary)]" />
              Report Specifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Report Name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Q3 Performance Review"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Reporting Window">
                <Select
                  value={config.dateRange}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      dateRange: e.target.value as CustomReportConfig["dateRange"],
                    }))
                  }
                >
                  <option value="last_7_days">Last 7 Days</option>
                  <option value="last_30_days">Last 30 Days</option>
                  <option value="last_90_days">Last 90 Days</option>
                  <option value="this_month">This Month</option>
                </Select>
              </Field>

              <Field label="Automated Delivery">
                <Select
                  value={schedule}
                  onChange={(e) =>
                    setSchedule(e.target.value as "none" | "weekly" | "monthly")
                  }
                >
                  <option value="none">Manual Only</option>
                  <option value="weekly">Weekly Digest</option>
                  <option value="monthly">Monthly Digest</option>
                </Select>
              </Field>
            </div>

            <Field label="Layout Arrangement">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setConfig((prev) => ({ ...prev, layout: "grid" }))}
                  className={`flex items-center justify-center gap-2 rounded-[var(--radius-md)] border p-2 text-[13px] font-medium transition-colors ${
                    config.layout === "grid"
                      ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                      : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  <LayoutGrid size={15} /> 2-Column Grid
                </button>
                <button
                  type="button"
                  onClick={() => setConfig((prev) => ({ ...prev, layout: "single" }))}
                  className={`flex items-center justify-center gap-2 rounded-[var(--radius-md)] border p-2 text-[13px] font-medium transition-colors ${
                    config.layout === "single"
                      ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                      : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  <Columns size={15} /> 1-Column Feed
                </button>
              </div>
            </Field>

            <Field label="Executive Summary Narrative">
              <Textarea
                rows={3}
                value={config.executiveSummary || ""}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, executiveSummary: e.target.value }))
                }
                placeholder="Add contextual commentary or executive summary for the recipient..."
              />
            </Field>
          </CardContent>
        </Card>

        {/* Widget Palette */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-[15px]">
                <BarChart3 size={16} className="text-[var(--primary)]" />
                Report Widgets ({config.widgets.length} active)
              </CardTitle>
              <Badge tone="primary">{config.widgets.length} Selected</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {REPORT_WIDGETS_METADATA.map((widget) => {
              const checked = config.widgets.includes(widget.key);
              return (
                <div
                  key={widget.key}
                  onClick={() => handleToggleWidget(widget.key)}
                  className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border p-2.5 transition-all ${
                    checked
                      ? "border-[var(--primary)]/50 bg-[var(--surface-sunken)]"
                      : "border-[var(--border)] bg-[var(--surface)] opacity-70 hover:opacity-100"
                  }`}
                >
                  <div className="mt-0.5" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => handleToggleWidget(widget.key)}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-semibold text-[var(--text)]">
                        {widget.label}
                      </p>
                      <span className="text-[11px] uppercase tracking-wider text-[var(--text-subtle)]">
                        {widget.category}
                      </span>
                    </div>
                    <p className="text-[12px] text-[var(--text-muted)]">
                      {widget.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* White-Label Branding Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[15px]">
              <Globe size={16} className="text-[var(--primary)]" />
              White-Label & Agency Branding
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isWhiteLabelEntitled ? (
              <>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="branding-logo"
                    checked={config.branding?.logo || false}
                    onCheckedChange={(v) =>
                      setConfig((prev) => ({
                        ...prev,
                        branding: { ...prev.branding, logo: !!v },
                      }))
                    }
                  />
                  <label
                    htmlFor="branding-logo"
                    className="cursor-pointer text-[13px] font-medium text-[var(--text)]"
                  >
                    Enable Custom Agency Header & Logo
                  </label>
                </div>

                {config.branding?.logo && (
                  <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-sunken)] p-3">
                    <Field label="Agency Display Name">
                      <Input
                        value={config.branding?.agencyName || ""}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            branding: { ...prev.branding, agencyName: e.target.value },
                          }))
                        }
                        placeholder="e.g. Apex Digital Marketing"
                      />
                    </Field>
                    <Field label="Brand Accent Color">
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={config.branding?.primaryColor || "#6366f1"}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              branding: { ...prev.branding, primaryColor: e.target.value },
                            }))
                          }
                          className="h-8 w-10 cursor-pointer rounded border border-[var(--border)] bg-transparent"
                        />
                        <Input
                          value={config.branding?.primaryColor || "#6366f1"}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              branding: { ...prev.branding, primaryColor: e.target.value },
                            }))
                          }
                          className="font-mono text-[12px]"
                          placeholder="#6366f1"
                        />
                      </div>
                    </Field>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-sunken)] p-3 text-[13px] text-[var(--text-muted)]">
                White-label branding is available on the Agency tier. Custom reports will be branded with standard workspace credentials.
              </div>
            )}

            <Button
              onClick={handleSave}
              disabled={isPending}
              className="w-full gap-2 font-semibold"
            >
              <Save size={15} />
              {isPending ? "Generating Template..." : "Save Custom Report"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Right Canvas / Live Preview */}
      <div className="space-y-4 lg:col-span-7">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Interactive Live Canvas
            </span>
            <Badge tone="success" className="gap-1 text-[11px]">
              <CheckCircle2 size={12} /> Responsive Layout
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" asChild>
              <a
                href={`/analytics/report?range=${selectedRangeDays}`}
                target="_blank"
                rel="noreferrer"
                className="gap-1.5 text-[12px]"
              >
                <Share2 size={13} /> PDF Preview
              </a>
            </Button>
          </div>
        </div>

        {/* Mock Report Paper Canvas */}
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
          {/* Header Banner */}
          <div
            className="rounded-[var(--radius-md)] border p-4 mb-6"
            style={{
              borderColor: config.branding?.logo
                ? `${config.branding.primaryColor || "#6366f1"}40`
                : "var(--border)",
              background: config.branding?.logo
                ? `linear-gradient(135deg, var(--surface) 0%, ${config.branding.primaryColor || "#6366f1"}10 100%)`
                : "var(--surface-sunken)",
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--primary)]">
                  {config.branding?.logo && config.branding.agencyName
                    ? config.branding.agencyName
                    : workspaceName}
                </span>
                <h2 className="text-[20px] font-bold tracking-tight text-[var(--text)]">
                  {name || "Social Media Performance Report"}
                </h2>
                <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                  Window: {config.dateRange.replace(/_/g, " ")} · Channels:{" "}
                  {channels.length > 0
                    ? channels.map((c) => c.platform).join(", ")
                    : "All connected channels"}
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-subtle)]">
                <Calendar size={14} />
                <span>Generated today</span>
              </div>
            </div>
          </div>

          {/* Executive Summary Block if Selected */}
          {config.widgets.includes("executive_summary") && (
            <div className="mb-6 rounded-[var(--radius-md)] border border-[var(--primary)]/30 bg-[var(--primary)]/5 p-4">
              <div className="flex items-center gap-1.5 font-semibold text-[13px] text-[var(--primary)] mb-1">
                <Sparkles size={14} />
                <span>Executive Summary</span>
              </div>
              <p className="text-[13px] leading-relaxed text-[var(--text)]">
                {config.executiveSummary ||
                  "Social engagement and audience footprint expanded across key target channels during this reporting window."}
              </p>
            </div>
          )}

          {/* Widgets Grid / Feed */}
          <div
            className={`grid gap-4 ${
              config.layout === "grid" ? "sm:grid-cols-2" : "grid-cols-1"
            }`}
          >
            {config.widgets
              .filter((w) => w !== "executive_summary")
              .map((wKey) => {
                const widgetMeta = REPORT_WIDGETS_METADATA.find((m) => m.key === wKey);
                if (!widgetMeta) return null;

                return (
                  <div
                    key={wKey}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-sunken)] p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-[var(--text)]">
                        {widgetMeta.label}
                      </span>
                      <span className="text-[11px] text-[var(--text-subtle)]">Live Metric</span>
                    </div>

                    {wKey === "followers_growth" && (
                      <div className="pt-2">
                        <div className="text-[22px] font-bold text-[var(--text)]">+1,248</div>
                        <p className="text-[11px] text-[var(--success)]">▲ 4.8% net audience gain</p>
                      </div>
                    )}

                    {wKey === "reach_impressions" && (
                      <div className="pt-2">
                        <div className="text-[22px] font-bold text-[var(--text)]">98.4K</div>
                        <p className="text-[11px] text-[var(--text-muted)]">Impressions across published updates</p>
                      </div>
                    )}

                    {wKey === "engagement_rate" && (
                      <div className="pt-2">
                        <div className="text-[22px] font-bold text-[var(--primary)]">4.92%</div>
                        <p className="text-[11px] text-[var(--text-muted)]">Industry benchmark: 2.1%</p>
                      </div>
                    )}

                    {wKey === "top_posts" && (
                      <div className="space-y-1.5 pt-1 text-[12px]">
                        <div className="truncate rounded border border-[var(--border)] bg-[var(--surface)] p-1.5 text-[var(--text)]">
                          🚀 Launching our customer spotlight series... (6.8% ER)
                        </div>
                        <div className="truncate rounded border border-[var(--border)] bg-[var(--surface)] p-1.5 text-[var(--text)]">
                          💡 5 tips for multi-channel cadence consistency... (5.2% ER)
                        </div>
                      </div>
                    )}

                    {wKey === "worst_posts" && (
                      <div className="pt-2 text-[12px] text-[var(--text-muted)]">
                        2 posts under 1.0% ER identified for copy & hashtag refresh.
                      </div>
                    )}

                    {wKey === "engagement_by_format" && (
                      <div className="space-y-1 pt-1 text-[11px]">
                        <div className="flex justify-between text-[var(--text)]">
                          <span>Carousel</span>
                          <span className="font-semibold text-[var(--success)]">5.9%</span>
                        </div>
                        <div className="flex justify-between text-[var(--text)]">
                          <span>Reels / Short Video</span>
                          <span className="font-semibold text-[var(--success)]">5.1%</span>
                        </div>
                        <div className="flex justify-between text-[var(--text)]">
                          <span>Single Image</span>
                          <span className="font-semibold text-[var(--text-muted)]">3.8%</span>
                        </div>
                      </div>
                    )}

                    {wKey === "platform_comparison" && (
                      <div className="space-y-1 pt-1 text-[11px]">
                        <div className="flex justify-between text-[var(--text)]">
                          <span>Instagram</span>
                          <span className="font-semibold">54% Share</span>
                        </div>
                        <div className="flex justify-between text-[var(--text)]">
                          <span>LinkedIn</span>
                          <span className="font-semibold">31% Share</span>
                        </div>
                        <div className="flex justify-between text-[var(--text)]">
                          <span>X (Twitter)</span>
                          <span className="font-semibold">15% Share</span>
                        </div>
                      </div>
                    )}

                    {wKey === "campaign_performance" && (
                      <div className="pt-2 text-[12px] text-[var(--text)]">
                        Active Campaigns: 3 · Goal Attainment: 84%
                      </div>
                    )}

                    {wKey === "posting_frequency" && (
                      <div className="pt-2 text-[12px] text-[var(--text)]">
                        Average Frequency: 4.2 posts/week · Peak slot: Tue 14:00
                      </div>
                    )}
                  </div>
                );
              })}
          </div>

          {config.widgets.length === 0 && (
            <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] p-8 text-center text-[13px] text-[var(--text-muted)]">
              Select at least one widget on the left to preview your custom report canvas.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
