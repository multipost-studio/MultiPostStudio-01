import type { Metadata } from "next";
import { ToolShell } from "../_tool-shell";
import { CaptionTool } from "./tool";

export const metadata: Metadata = { title: "Free caption generator" };

export default function Page() {
  return (
    <ToolShell
      slug="caption-generator"
      title="Free caption generator"
      description="Describe your post in a sentence and get three ready-to-edit captions — a hook, the body, and a call to action."
      intro="Great for beating the blank page. In Cadence the same generator is tuned to your Brand Brain and platform limits."
      steps={[
        { title: "Describe the post", body: "One line is enough: the topic, the vibe, and who it's for." },
        { title: "Pick a direction", body: "You get three angles — punchy, informative and story-led. Take the closest one." },
        { title: "Edit and ship", body: "Swap in your specifics, add a CTA, and paste it wherever you publish." },
      ]}
      tips={[
        "Name the audience — \"for first-time founders\" beats \"for everyone\".",
        "Give one concrete detail (a number, a place, a result) so the caption isn't generic.",
        "Say the format: carousel, reel, single image — the hook changes with it.",
        "Keep the first line under ~8 words; that's what shows before \"more\".",
      ]}
      faq={[
        { q: "Is my input stored?", a: "No. This tool runs in your browser and keeps nothing." },
        { q: "Will it match my brand voice?", a: "Not here — this is a generic starting point. Inside Cadence the Brand Brain learns your voice from your past posts and guidelines." },
        { q: "How many can I generate?", a: "Unlimited. It's free, no account needed." },
      ]}
    >
      <CaptionTool />
    </ToolShell>
  );
}
