import type { Metadata } from "next";
import { ToolShell } from "../_tool-shell";

export const metadata: Metadata = { title: "Best time to post calculator" };

const SCHEDULE: Record<string, string[]> = {
  Instagram: ["Tue 11:00", "Wed 14:00", "Thu 19:00", "Sat 10:00"],
  LinkedIn: ["Tue 08:00", "Wed 12:00", "Thu 17:00"],
  X: ["Mon 09:00", "Wed 12:00", "Fri 15:00", "Sun 20:00"],
  TikTok: ["Tue 18:00", "Thu 21:00", "Sat 11:00", "Sun 16:00"],
  Facebook: ["Wed 13:00", "Fri 10:00", "Sun 12:00"],
};

export default function Page() {
  return (
    <ToolShell
      slug="best-time"
      title="Best time to post on social media"
      description="A sensible starting schedule per platform, based on aggregate consumer-audience patterns. Use it until you have your own data."
      intro="“Best time” is really “best time for your audience”. This is a baseline — Cadence learns your real best hours from your engagement history and places posts automatically."
      steps={[
        { title: "Start from the baseline", body: "Pick 2–3 slots per platform from the table below and schedule a few weeks of posts." },
        { title: "Watch what lands", body: "After ~20 posts per platform you'll see which slots consistently outperform." },
        { title: "Let the queue optimise", body: "In Cadence, switch each channel's queue to AI-optimised timing and it adjusts as your audience shifts." },
      ]}
      tips={[
        "Consistency beats perfect timing — posting on a predictable cadence trains the algorithm and your audience.",
        "Evenings (17:00–21:00 local) outperform mornings for most consumer audiences; B2B skews to 08:00–12:00.",
        "Weekends are strong for TikTok and Instagram, weak for LinkedIn.",
        "Time zones matter: schedule to your largest audience region, not your own.",
      ]}
      faq={[
        { q: "Are these times guaranteed to work?", a: "No — they're population averages. Your niche, region and audience can differ a lot. Treat them as a hypothesis to test." },
        { q: "How long until I can trust my own data?", a: "Roughly 4–6 weeks of consistent posting, or ~20 posts per platform." },
        { q: "Does Cadence do this automatically?", a: "Yes. Each channel's queue can run on AI-optimised timing that updates from your own results." },
      ]}
    >
      <div className="space-y-4">
        {Object.entries(SCHEDULE).map(([platform, slots]) => (
          <div key={platform} className="flex flex-wrap items-center gap-2">
            <span className="w-24 shrink-0 text-[14px] font-semibold text-[var(--text)]">{platform}</span>
            {slots.map((s) => (
              <span key={s} className="rounded-full bg-[var(--bg-sunken)] px-2.5 py-1 text-[13px] text-[var(--text-muted)]">
                {s}
              </span>
            ))}
          </div>
        ))}
        <p className="text-[13px] text-[var(--text-subtle)]">
          Times are local, weekday-biased. Evenings outperform mornings for most consumer audiences; B2B skews earlier.
        </p>
      </div>
    </ToolShell>
  );
}
