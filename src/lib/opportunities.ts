import { db } from "@/lib/db";
import { getAnalytics } from "@/lib/analytics";

export type OpportunityInput = { title: string; rationale: string; type: string; score: number };

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY = 86_400_000;

/**
 * Real gap analysis over a workspace's own published-post history (last 90d).
 * Every item is derived from a measurable signal — no history, no
 * opportunities. Scores are the Content Opportunity Score (0-100), higher =
 * stronger signal.
 */
export async function generateOpportunities(workspaceId: string): Promise<OpportunityInput[]> {
  const a = await getAnalytics(workspaceId, 90);
  const out: OpportunityInput[] = [];
  if (a.postCount < 3) return out;

  // Format gap — a format that outperforms the others but is under-used.
  const usedFormats = a.byFormat.filter((f) => f.posts > 0);
  if (usedFormats.length >= 2) {
    const maxPosts = Math.max(...usedFormats.map((f) => f.posts));
    const meanER = usedFormats.reduce((n, f) => n + f.avgEngagementRate, 0) / usedFormats.length;
    for (const f of usedFormats) {
      if (meanER > 0 && f.avgEngagementRate > meanER * 1.25 && f.posts <= maxPosts * 0.4) {
        const lift = f.avgEngagementRate / meanER;
        out.push({
          type: "format",
          title: `Post more ${f.format} content`,
          rationale: `${f.format} averages ${f.avgEngagementRate.toFixed(1)}% engagement vs ${meanER.toFixed(1)}% across your formats, but only ${f.posts} of your last ${a.postCount} posts used it.`,
          score: clamp(55 + (lift - 1) * 40, 45, 92),
        });
      }
    }
  }

  // Timing gap — your best-performing posting slot, barely used.
  const slot = a.bestSlots.find((s) => s.value > 0);
  if (slot && a.postCount >= 4) {
    const slotPosts = a.heatCells.find((c) => c.day === slot.day && c.hour === slot.hour)?.posts ?? 0;
    if (slotPosts <= 2) {
      out.push({
        type: "timing",
        title: `Publish around ${DOW[slot.day]} ${String(slot.hour).padStart(2, "0")}:00`,
        rationale: `Posts in that window averaged ${slot.value.toFixed(1)}% engagement — your strongest slot — but you've only posted there ${slotPosts} time(s).`,
        score: clamp(50 + slot.value * 2, 45, 88),
      });
    }
  }

  // Cadence gap — below your own posts-per-week goal.
  const goal = await db.contentGoal.findFirst({ where: { workspaceId, metric: "posts_per_week" } });
  if (goal && goal.target > 0) {
    const perWeek = a.postCount / (a.days / 7);
    if (perWeek < goal.target * 0.8) {
      out.push({
        type: "gap",
        title: `Raise cadence toward ${goal.target} posts/week`,
        rationale: `You're publishing about ${perWeek.toFixed(1)} posts/week over the last ${a.days} days; your goal is ${goal.target}.`,
        score: clamp(60 + (goal.target - perWeek) * 8, 50, 90),
      });
    }
  }

  // Pillar gaps — a strong pillar that's neglected, or one gone quiet.
  const pillars = a.byPillar.filter((p) => p.name !== "Uncategorized");
  if (pillars.length >= 2) {
    const meanER = pillars.reduce((n, p) => n + p.avgEngagementRate, 0) / pillars.length;
    const busiest = Math.max(...pillars.map((p) => p.posts));
    for (const p of pillars) {
      if (p.posts === 0 && busiest >= 2) {
        out.push({
          type: "topic",
          title: `Cover "${p.name}" — nothing published lately`,
          rationale: `No "${p.name}" posts in the last ${a.days} days, while other pillars have up to ${busiest}.`,
          score: 70,
        });
      } else if (meanER > 0 && p.avgEngagementRate > meanER * 1.2 && p.posts > 0 && p.posts <= busiest * 0.4) {
        out.push({
          type: "topic",
          title: `Lean into "${p.name}"`,
          rationale: `"${p.name}" averages ${p.avgEngagementRate.toFixed(1)}% engagement (above your ${meanER.toFixed(1)}% pillar average) on just ${p.posts} posts.`,
          score: clamp(58 + (p.avgEngagementRate / meanER - 1) * 35, 48, 90),
        });
      }
    }
  }

  // Hashtag gap — a high-performing tag you rarely use.
  const topTag = a.byHashtag.find((t) => t.avgEngagementRate > 0);
  if (topTag && topTag.posts <= 2 && a.byHashtag.length >= 3) {
    out.push({
      type: "topic",
      title: `Use #${topTag.name} more often`,
      rationale: `#${topTag.name} averaged ${topTag.avgEngagementRate.toFixed(1)}% engagement across ${topTag.posts} post(s) — one of your best tags, barely used.`,
      score: clamp(50 + topTag.avgEngagementRate * 2, 45, 85),
    });
  }

  // Repurpose — an old top performer worth reformatting.
  const now = Date.now();
  const old = a.topPosts.find(
    (p) => p.publishedAtDate && now - p.publishedAtDate.getTime() > 21 * DAY && p.engagementRate > 0,
  );
  if (old?.publishedAtDate) {
    const ageDays = Math.round((now - old.publishedAtDate.getTime()) / DAY);
    out.push({
      type: "repurpose",
      title: `Repurpose "${old.title}"`,
      rationale: `Your top post at ${old.engagementRate.toFixed(1)}% engagement, published ${ageDays} days ago. Reformat it for another platform or refresh the hook.`,
      score: clamp(55 + old.engagementRate * 2, 50, 88),
    });
  }

  const seen = new Set<string>();
  return out
    .sort((x, y) => y.score - x.score)
    .filter((o) => (seen.has(o.title) ? false : (seen.add(o.title), true)))
    .slice(0, 8);
}
