import type { Metadata } from "next";
import { ToolShell } from "../_tool-shell";
import { CharCounter } from "./tool";

export const metadata: Metadata = { title: "Social character counter" };

export default function Page() {
  return (
    <ToolShell
      slug="character-counter"
      title="Social media character counter"
      description="Paste your caption and see a live character count against every platform's limit — plus how much shows before the “more” cutoff."
      intro="Different networks truncate at different points. This shows all of them at once so one draft works everywhere."
      steps={[
        { title: "Paste your text", body: "Type or paste the caption you're planning to post." },
        { title: "Read the meters", body: "Each platform shows a live count and turns amber, then red, as you approach its limit." },
        { title: "Trim to fit", body: "Aim to land the key line above each platform's visible-before-truncation mark." },
      ]}
      tips={[
        "X: 280. Instagram: 2,200 (only ~125 show before “more”). LinkedIn: 3,000 (~140 visible).",
        "TikTok: 2,200. Threads: 500. Bluesky: 300. Pinterest: 500. YouTube: 5,000.",
        "Front-load the hook — write for the truncated preview, not the full length.",
        "Emoji and some symbols count as 2+ characters on certain platforms.",
      ]}
      faq={[
        { q: "Does it count hashtags and mentions?", a: "Yes — everything in the box counts, exactly as the platform would." },
        { q: "Is my text saved?", a: "No. It never leaves your browser." },
        { q: "Which limits are these?", a: "Current public caption limits for each network, updated periodically." },
      ]}
    >
      <CharCounter />
    </ToolShell>
  );
}
