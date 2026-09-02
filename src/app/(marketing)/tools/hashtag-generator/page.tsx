import type { Metadata } from "next";
import { ToolShell } from "../_tool-shell";
import { HashtagTool } from "./tool";

export const metadata: Metadata = { title: "Free hashtag generator" };

export default function Page() {
  return (
    <ToolShell
      slug="hashtag-generator"
      title="Free hashtag generator"
      description="Enter a topic and get a focused hashtag set — a few broad-reach tags, a few niche ones, no 30-tag spam."
      intro="A tight, relevant set beats a wall of tags on every platform. Inside MultiPost Studio, sets are saved per workspace and checked against each platform's limits."
      steps={[
        { title: "Enter your topic", body: "A keyword or short phrase — \"sustainable fashion\", \"indie game dev\"." },
        { title: "Get a grouped set", body: "Tags are split by reach so you can balance discovery and relevance." },
        { title: "Copy what fits", body: "Take 5–15, not 30. Rotate them so your account doesn't look automated." },
      ]}
      tips={[
        "Mix reach levels: 2–3 large, 4–6 mid, 3–5 niche. Niche tags convert better.",
        "Skip banned or shadow-flagged tags — they can suppress the whole post.",
        "Put tags in the first comment on Instagram if you want a cleaner caption.",
        "LinkedIn and X: 3–5 tags max. More looks like spam.",
      ]}
      faq={[
        { q: "Are these real, active hashtags?", a: "They're generated from your topic as sensible candidates. Always sanity-check volume on the platform before you commit." },
        { q: "How many should I use?", a: "Instagram/TikTok: 5–15. LinkedIn/X/Threads: 3–5. Facebook: 1–3." },
        { q: "Does it store my topics?", a: "No — nothing you type leaves your browser." },
      ]}
    >
      <HashtagTool />
    </ToolShell>
  );
}
