import type { Metadata } from "next";
import { ToolShell } from "../_tool-shell";
import { EngagementRateTool } from "./tool";

export const metadata: Metadata = { title: "Engagement rate calculator" };

export default function Page() {
  return (
    <ToolShell
      slug="engagement-rate"
      title="Engagement rate calculator"
      description="Calculate engagement rate by reach, by impressions, or by followers. Enter your numbers and get all three."
      intro="There's no single “correct” engagement rate — pick the denominator that matches what you're comparing against."
      steps={[
        { title: "Gather three numbers", body: "Total engagements (likes + comments + shares + saves), plus reach, impressions or follower count." },
        { title: "Enter them", body: "The calculator returns ER by reach (ERR), by impressions, and by followers." },
        { title: "Compare like-for-like", body: "Benchmark against your own past posts using the same denominator each time." },
      ]}
      tips={[
        "By reach (ERR) is the fairest measure of content quality — it excludes people who never saw it.",
        "By followers is what most “industry benchmark” articles use, so use it when comparing to those.",
        "Typical by-follower ER: Instagram 0.5–1%, TikTok 3–9%, LinkedIn 2–4%. Smaller accounts skew higher.",
        "Saves and shares are worth more than likes — they signal the algorithm to push reach.",
      ]}
      faq={[
        { q: "Which engagements count?", a: "Usually likes, comments, shares and saves. Some teams add profile taps and link clicks — just be consistent." },
        { q: "Why are my three numbers so different?", a: "Reach < impressions < followers for most posts, so ER-by-reach is highest and ER-by-followers lowest." },
        { q: "Is anything stored?", a: "No — the math runs in your browser only." },
      ]}
    >
      <EngagementRateTool />
    </ToolShell>
  );
}
