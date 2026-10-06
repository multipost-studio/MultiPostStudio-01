"use client";

import * as React from "react";
import { Check, Copy, Info, TriangleAlert } from "lucide-react";
import { Field, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { buildUtmLink, parseTouch } from "@/lib/attribution";

const PRESETS: { label: string; source: string; medium: string }[] = [
  { label: "Google Ads", source: "google", medium: "cpc" },
  { label: "Meta Ads", source: "facebook", medium: "paid_social" },
  { label: "LinkedIn Ads", source: "linkedin", medium: "paid_social" },
  { label: "Newsletter", source: "newsletter", medium: "email" },
  { label: "Instagram bio", source: "instagram", medium: "social" },
  { label: "X post", source: "x", medium: "social" },
  { label: "LinkedIn post", source: "linkedin", medium: "social" },
  { label: "Partner / influencer", source: "", medium: "affiliate" },
];

export function LinksClient({
  siteUrl,
  destinations,
  campaigns,
  sources,
}: {
  siteUrl: string;
  destinations: { label: string; path: string }[];
  campaigns: string[];
  sources: string[];
}) {
  const { toast } = useToast();
  const [dest, setDest] = React.useState(destinations[0]?.path ?? "/");
  const [custom, setCustom] = React.useState("");
  const [source, setSource] = React.useState("");
  const [medium, setMedium] = React.useState("");
  const [campaign, setCampaign] = React.useState("");
  const [term, setTerm] = React.useState("");
  const [content, setContent] = React.useState("");
  const [copied, setCopied] = React.useState(false);

  const url = custom.trim() || `${siteUrl.replace(/\/$/, "")}${dest}`;
  const result = React.useMemo(() => buildUtmLink({ url, source, medium, campaign, term, content }), [url, source, medium, campaign, term, content]);

  const touched = source || medium || campaign;
  const channel = result.ok ? parseTouch({ landing: new URL(result.link).pathname + new URL(result.link).search, selfHosts: [] }).channel : null;
  const campaignKnown = campaign.trim() && campaigns.includes(campaign.trim().toLowerCase().replace(/\s+/g, "_"));

  async function copy() {
    if (!result.ok) return;
    try {
      await navigator.clipboard.writeText(result.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({ title: "Couldn't copy. Select the link and copy it manually.", tone: "error" });
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader>
          <CardTitle>Build a tracked link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-[var(--text-muted)]">Start from a preset</p>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setSource(p.source);
                    setMedium(p.medium);
                  }}
                  className="rounded-full border border-[var(--border)] px-3 py-1 text-[13px] text-[var(--text-muted)] transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Destination page">
              <Select value={dest} onChange={(e) => setDest(e.target.value)} disabled={!!custom.trim()}>
                {destinations.map((d) => (
                  <option key={d.path} value={d.path}>
                    {d.label} ({d.path})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="…or any URL" hint="Overrides the page on the left">
              <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="https://multipoststudio.online/blog/…" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Source" hint="Where the link is posted: google, newsletter, linkedin">
              <Input value={source} onChange={(e) => setSource(e.target.value)} list="utm-sources" aria-label="Source" placeholder="google" autoComplete="off" />
              <datalist id="utm-sources">
                {sources.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            <Field label="Medium" hint="The channel type: cpc, email, social, referral, affiliate">
              <Input value={medium} onChange={(e) => setMedium(e.target.value)} placeholder="cpc" autoComplete="off" />
            </Field>
          </div>

          <Field label="Campaign" hint={campaignKnown ? "Already in use. Good, this keeps reporting together." : "A short name for the promotion: spring_launch"}>
            <Input value={campaign} onChange={(e) => setCampaign(e.target.value)} list="utm-campaigns" aria-label="Campaign" placeholder="spring_launch" autoComplete="off" />
            <datalist id="utm-campaigns">
              {campaigns.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Term (optional)" hint="Paid keyword">
              <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="social media scheduler" />
            </Field>
            <Field label="Content (optional)" hint="Tells two ads or buttons apart">
              <Input value={content} onChange={(e) => setContent(e.target.value)} placeholder="headline_a" />
            </Field>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Your link</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {result.ok ? (
              <>
                <textarea
                  readOnly
                  value={result.link}
                  rows={4}
                  aria-label="Tracked link"
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full resize-none break-all rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-sunken)] p-2.5 font-mono text-[12.5px] text-[var(--text)]"
                />
                <Button onClick={copy} className="w-full">
                  {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
                  {copied ? "Copied" : "Copy link"}
                </Button>
                <p className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
                  Reports will file this under <Badge tone="primary">{channel}</Badge>
                </p>
                {result.warnings.map((w) => (
                  <p key={w} className="flex items-start gap-2 text-[12.5px] text-[var(--warning)]">
                    <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden /> {w}
                  </p>
                ))}
              </>
            ) : (
              <p className="flex items-start gap-2 text-[13.5px] text-[var(--text-muted)]">
                <Info size={15} className="mt-0.5 shrink-0" aria-hidden />
                {touched ? result.error : "Pick a preset or fill in source, medium and campaign to generate a link."}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Naming that keeps reports clean</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-[13px] text-[var(--text-muted)]">
            <p>Names are lowercased and spaces become underscores, so &quot;Spring Launch&quot; and &quot;spring_launch&quot; are one campaign.</p>
            <p>Common spellings merge automatically (fb, Facebook and facebook.com are all &quot;facebook&quot;).</p>
            <p>Use one campaign name across every link in the same promotion, and different <em>content</em> values to compare ads.</p>
            <p>Anything with a medium we don&apos;t recognise lands in &quot;Other&quot;. Stick to cpc, paid_social, email, social, referral, affiliate or display.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
