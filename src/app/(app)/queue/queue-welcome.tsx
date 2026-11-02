"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlatformBadge } from "@/components/brand";
import { useToast } from "@/components/ui/toast";
import { applySuggestedTimesAction, setProfileTimezoneAction } from "@/app/actions/posting-times";
import { POSTING_RESEARCH, POSTS_PER_WEEK, describeResearch, describeSlot, researchFor, suggestSlots } from "@/lib/posting-times";
import { tzCity } from "@/lib/tz-math";

/**
 * Shown while some channel has no posting times: says what will be set and where it comes from (published research, with the
 * source, date and size of the study), lets the person choose how often, and sets it in one click. Nothing is set until they press
 * the button, and nothing here is invented: no industry numbers are used because the research does not publish any.
 */

const CHOICES: { n: (typeof POSTS_PER_WEEK)[number]; title: string; hint: string }[] = [
  { n: 1, title: "Steady", hint: "1 post a week" },
  { n: 3, title: "Regular", hint: "3 posts a week" },
  { n: 5, title: "Busy", hint: "up to 5 posts a week" },
];

export function QueueWelcome({
  channels,
  target,
  profileTimezone,
  deviceZone,
  canEdit,
}: {
  /** Channels with no posting times yet (the ones in view). */
  channels: { id: string; name: string; platform: string }[];
  /** A channel id, or "all-empty". */
  target: string;
  profileTimezone: string;
  deviceZone: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [perWeek, setPerWeek] = React.useState<(typeof POSTS_PER_WEEK)[number]>(3);
  const [busy, setBusy] = React.useState<"set" | "zone" | null>(null);
  const [hidden, setHidden] = React.useState(false);
  if (hidden || channels.length === 0) return null;

  const first = channels[0];
  const platforms = [...new Set(channels.map((c) => c.platform))];
  const uncovered = platforms.filter((p) => !researchFor(p).specific);
  const zoneMismatch = profileTimezone !== deviceZone;

  async function apply() {
    setBusy("set");
    const res = await applySuggestedTimesAction(target, perWeek);
    setBusy(null);
    toast({ title: res.ok ? res.message ?? "Posting times set" : "Couldn't set posting times", description: res.error, tone: res.ok ? "success" : "error" });
    if (res.ok) router.refresh();
  }

  async function useDeviceZone() {
    setBusy("zone");
    const res = await setProfileTimezoneAction(deviceZone);
    setBusy(null);
    toast({ title: res.ok ? `Time zone set to ${tzCity(deviceZone)}` : "Couldn't change the time zone", description: res.error, tone: res.ok ? "success" : "error" });
    if (res.ok) router.refresh();
  }

  return (
    <section aria-label="Set your posting times" className="mb-5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
          <Sparkles size={16} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-semibold text-[var(--text)]">
            {channels.length === 1 ? `Set posting times for ${first.name}` : `Set posting times for ${channels.length} channels`}
          </h2>
          <p className="mt-1 text-[13.5px] text-[var(--text-muted)]">
            This is where your scheduled posts line up. We can fill your queue with starting times from published research, then you can change any
            of them. As you publish, we measure your own results and show your best times here.
          </p>

          {canEdit ? (
            <>
              <div role="radiogroup" aria-label="How often do you want to post?" className="mt-4 grid gap-2 sm:grid-cols-3">
                {CHOICES.map((c) => {
                  const on = perWeek === c.n;
                  return (
                    <button
                      key={c.n}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setPerWeek(c.n)}
                      className={`rounded-[var(--radius-md)] border px-3 py-2 text-left transition-colors ${on ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--border)] hover:bg-[var(--surface-hover)]"}`}
                    >
                      <span className="block text-[13.5px] font-semibold text-[var(--text)]">{c.title}</span>
                      <span className="block text-[12.5px] text-[var(--text-muted)]">{c.hint}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 space-y-1.5 text-[13px] text-[var(--text-muted)]">
                {channels.slice(0, 4).map((c) => {
                  const slots = suggestSlots(c.platform, perWeek);
                  return (
                    <p key={c.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="inline-flex items-center gap-1.5 font-medium text-[var(--text)]">
                        <PlatformBadge platform={c.platform} size={14} /> {c.name}
                      </span>
                      <span>{slots.map(describeSlot).join(", ")}</span>
                    </p>
                  );
                })}
                {channels.length > 4 && <p>and {channels.length - 4} more channels.</p>}
              </div>

              <p className="mt-3 text-[12.5px] text-[var(--text-subtle)]">
                Times are in your profile time zone, <span className="font-medium text-[var(--text-muted)]">{tzCity(profileTimezone)}</span>, and assume your audience is in the same one.
              </p>
              {zoneMismatch && (
                <p role="status" className="mt-1.5 rounded-[var(--radius-md)] bg-[var(--warning-soft)] px-3 py-2 text-[12.5px] text-[var(--text)]">
                  Your profile time zone is {tzCity(profileTimezone)}, but this device is in {tzCity(deviceZone)}. If your audience is in {tzCity(deviceZone)}, switch first so
                  the times land at the right hour.{" "}
                  <button type="button" onClick={useDeviceZone} disabled={busy !== null} className="font-medium text-[var(--primary)] underline-offset-2 hover:underline disabled:opacity-60">
                    Use {tzCity(deviceZone)}
                  </button>
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button size="sm" loading={busy === "set"} disabled={busy === "zone"} onClick={apply}>
                  Set my posting times
                </Button>
                <Button size="sm" variant="ghost" asChild>
                  <Link href="/settings/workspace#posting-schedule">Set a custom schedule</Link>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setHidden(true)}>
                  Not now
                </Button>
              </div>
            </>
          ) : (
            <p className="mt-3 text-[13px] text-[var(--text-muted)]">Someone with publishing access can set the posting times.</p>
          )}

          <details className="mt-4 text-[12.5px] text-[var(--text-muted)]">
            <summary className="cursor-pointer font-medium text-[var(--text)]">Where do these times come from?</summary>
            <div className="mt-2 space-y-2">
              <p>
                From <a className="font-medium text-[var(--primary)] underline-offset-2 hover:underline" href={POSTING_RESEARCH.url} target="_blank" rel="noopener noreferrer">{POSTING_RESEARCH.source}&apos;s &ldquo;{POSTING_RESEARCH.title}&rdquo;</a>{" "}
                ({POSTING_RESEARCH.updated}), a study of {POSTING_RESEARCH.basis}. Each post goes in the middle of one of the study&apos;s best windows for that network.
              </p>
              {platforms.map((p) => (
                <div key={p}>
                  <p className="flex items-center gap-1.5 font-medium text-[var(--text)]">
                    <PlatformBadge platform={p} size={13} /> {researchFor(p).specific ? "Published windows" : "The study's overall result"}
                  </p>
                  <ul className="ml-5 list-disc">
                    {describeResearch(p).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ))}
              {uncovered.length > 0 && <p>The study doesn&apos;t cover every network. Where it doesn&apos;t, we use its overall result (Tuesdays and Wednesdays, midday to late afternoon).</p>}
              <p>The study publishes times per network, not per industry, so your industry isn&apos;t used to pick times and no industry figures are made up.</p>
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}

