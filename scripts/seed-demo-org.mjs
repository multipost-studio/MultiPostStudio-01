/**
 * Add a self-contained DEMO workspace to a real deployment — additively.
 *
 *   node scripts/seed-demo-org.mjs            # DRY RUN — prints what it would create
 *   node scripts/seed-demo-org.mjs --execute  # actually creates it
 *
 * This is the safe counterpart to `prisma/seed.ts`, whose first act is an
 * unfiltered deleteMany() across ~63 tables (every user, org, subscription,
 * invoice and OAuth token). That one is only ever valid against a throwaway
 * local database; this one touches NOTHING outside the demo org and is the
 * exact inverse of scripts/purge-demo-data.mjs.
 *
 * Deliberate safety properties:
 *   - The demo user is NOT a platform admin. Demo credentials are shared by
 *     nature; platform admin would expose every real customer's org, billing
 *     and users. Keep admin on your own account instead.
 *   - Social accounts get NO access token, so the production publish guard in
 *     src/lib/adapters/queue.ts refuses to publish them rather than faking it.
 *   - Published demo posts use the reserved `.example` TLD, so a demo permalink
 *     can never be mistaken for a real one.
 *   - Global config (plans, feature flags, CMS, system settings) is untouched.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const EXECUTE = process.argv.includes("--execute");

const ORG_SLUG = "northwind-studio";
const DEMO_EMAIL = "demo@multipoststudio.app";
const DEMO_PASSWORD = "demo1234";
// Days of daily MetricSnapshot history — analytics ranges go up to 90d.
const SNAPSHOT_DAYS = 90;

/**
 * Platforms whose only publishable content type needs a video (see
 * src/lib/social/capabilities.ts). They can't share a post with Instagram:
 * IG Feed allows exactly ONE media item and rejects 16:9, so a post targeting
 * both could never satisfy either. Demo posts therefore target one group.
 */
const VIDEO_ONLY = new Set(["youtube"]);
// 1:1 is in AR_FEED_IG, so a square image validates on Instagram and Facebook.
const IMAGE_DIMS = { width: 1080, height: 1080 };
// 16:9 for YouTube; well inside its length limits.
const VIDEO_DIMS = { width: 1920, height: 1080, durationSec: 45 };

const day = 86_400_000;
const now = Date.now();
/** Offset day at 15:00 UTC, never in the future. */
const publishInstant = (offsetDays) => {
  const base = new Date();
  base.setUTCHours(15, 0, 0, 0);
  const t = base.getTime() + offsetDays * day;
  return new Date(Math.min(t, Date.now() - 60_000));
};

const d = (offsetDays, hour = 10) => {
  const x = new Date(now + offsetDays * day);
  x.setHours(hour, 0, 0, 0);
  return x;
};

const USERS = [
  { email: DEMO_EMAIL, name: "Avery Quinn", role: "owner" },
  { email: "maya@multipoststudio.app", name: "Maya Osei", role: "manager" },
  { email: "leo@multipoststudio.app", name: "Leo Marchetti", role: "editor" },
];

const WORKSPACES = [
  {
    name: "Northwind Brand", slug: "northwind-brand", kind: "brand", clientName: null,
    industry: "Agency / Marketing", site: "https://northwind.studio",
    voice: "Confident, plainspoken, a little witty. Short sentences. No jargon.",
    platforms: ["instagram", "facebook", "youtube"],
  },
  {
    name: "Alpine Coffee", slug: "alpine-coffee", kind: "client", clientName: "Alpine Coffee Roasters",
    industry: "Food & Beverage", site: "https://alpine.coffee",
    voice: "Warm, sensory, unpretentious. Talk about craft without being snobby.",
    platforms: ["instagram", "threads"],
  },
  {
    name: "Fitwave", slug: "fitwave", kind: "client", clientName: "Fitwave App",
    industry: "Health / Wellness", site: "https://fitwave.app",
    voice: "Energetic, encouraging, science-backed. Motivate without hype.",
    platforms: ["instagram", "youtube"],
  },
];

const TOPICS = [
  "behind the roast", "three lessons from launch week", "what our data says about posting times",
  "meet the team", "a small ritual that changed our mornings", "the one metric we stopped tracking",
  "how we plan a month of content", "answering your top question", "a quiet win worth sharing",
  "notes from a redesign", "the tool we almost shelved", "field notes from this week",
];

// [status, day offset from today]
// Published days are CONSECUTIVE and run up to today so the posting streak
// (derived from real publish history — see src/lib/streak.ts) shows an active
// run in the demo instead of eight unrelated days.
const SCHEDULE = [
  ["published", -7], ["published", -6], ["published", -5], ["published", -4],
  ["published", -3], ["published", -2], ["published", -1], ["published", 0],
  ["scheduled", 1], ["scheduled", 3], ["scheduled", 5],
  // Values must come from POST_STATUS in src/lib/constants.ts — an unknown
  // status has no POST_STATUS_META entry and renders as a broken badge.
  ["draft", 0], ["awaiting_approval", 2], ["approved", 4],
];

async function main() {
  const existing = await db.organization.findUnique({ where: { slug: ORG_SLUG } });
  if (existing) {
    console.log(`Demo org "${ORG_SLUG}" already exists (${existing.id}).`);
    console.log("Nothing to do. To rebuild: node scripts/purge-demo-data.mjs --execute, then re-run this.");
    return;
  }

  const clash = await db.user.findMany({
    where: { email: { in: USERS.map((u) => u.email) } },
    select: { email: true },
  });
  if (clash.length) {
    console.error(`ABORT — these users already exist: ${clash.map((c) => c.email).join(", ")}`);
    console.error("Refusing to touch accounts this script did not create.");
    process.exitCode = 1;
    return;
  }

  const plan = await db.plan.findUnique({ where: { key: "agency" } });
  if (!plan) {
    console.error('ABORT — no "agency" plan row. Run scripts/sync-plan-entitlements.mjs first.');
    process.exitCode = 1;
    return;
  }

  const channelCount = WORKSPACES.reduce((n, w) => n + w.platforms.length, 0);
  console.log(`Org:         Northwind Studio (${ORG_SLUG}), plan=agency`);
  console.log(`Users:       ${USERS.map((u) => `${u.email} [${u.role}]`).join(", ")}`);
  console.log(`Password:    ${DEMO_PASSWORD}   (platform admin: NO)`);
  console.log(`Workspaces:  ${WORKSPACES.map((w) => w.name).join(", ")}`);
  console.log(`Channels:    ${channelCount} (no access tokens — cannot publish)`);
  console.log(`Posts:       ${WORKSPACES.length * SCHEDULE.length}`);

  if (!EXECUTE) {
    console.log("\nDRY RUN — nothing written. Re-run with --execute to apply.");
    return;
  }

  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const created = {};
  for (const u of USERS) {
    created[u.email] = await db.user.create({
      data: {
        email: u.email,
        name: u.name,
        passwordHash: hash,
        emailVerified: new Date(),
        isPlatformAdmin: false, // see header — never true for shared credentials
        timezone: "America/New_York",
        notificationPref: { create: {} },
      },
    });
  }

  const org = await db.organization.create({
    data: { name: "Northwind Studio", slug: ORG_SLUG, type: "agency" },
  });
  await db.membership.createMany({
    data: USERS.map((u) => ({ orgId: org.id, userId: created[u.email].id, role: u.role })),
  });
  await db.subscription.create({
    data: { orgId: org.id, planId: plan.id, status: "active", interval: "month", currentPeriodEnd: d(21) },
  });

  const authors = USERS.map((u) => created[u.email].id);
  let posts = 0;
  let snapshotRows = 0;

  for (const [wi, w] of WORKSPACES.entries()) {
    const ws = await db.workspace.create({
      data: {
        orgId: org.id, name: w.name, slug: w.slug, kind: w.kind, clientName: w.clientName,
        industry: w.industry, brandVoice: w.voice, websiteUrl: w.site,
        brandColors: JSON.stringify(["#6f262c", "#cc8b86", "#fffaf6"]),
      },
    });

    const channels = [];
    for (const platform of w.platforms) {
      const handle = `@${w.slug.replace(/-/g, "")}`;
      const acct = await db.socialAccount.create({
        data: {
          workspaceId: ws.id, platform, handle,
          // Per-platform: the dashboard Connections panel renders displayName,
          // so a shared workspace name made every row read identically.
          displayName: `${w.name} · ${platform[0].toUpperCase()}${platform.slice(1)}`,
          status: "connected", scopes: "read,write", lastSyncedAt: d(0, 6),
          // No accessToken on purpose — the publish guard must refuse these.
        },
      });
      channels.push(
        await db.socialChannel.create({
          data: {
            // Per-platform name: every channel sharing the workspace name made
            // the Connections list read as three identical rows.
            workspaceId: ws.id, socialAccountId: acct.id, platform, handle,
            name: `${w.name} · ${platform[0].toUpperCase()}${platform.slice(1)}`,
            followerCount: 4200 + wi * 3100 + w.platforms.indexOf(platform) * 1700,
            timezone: "America/New_York",
          },
        }),
      );
    }

    // Media library for this workspace. Local SVG covers (public/media) — the
    // same convention as prisma/seed.ts, so nothing depends on the network.
    const cover = (n) => `/media/cover-${String((n % 12) + 1).padStart(2, "0")}.svg`;
    const makeAsset = (n, kind) =>
      db.mediaAsset.create({
        data: {
          workspaceId: ws.id,
          uploaderId: authors[n % authors.length],
          kind,
          url: cover(wi * 4 + n),
          thumbUrl: cover(wi * 4 + n),
          filename: `${w.slug}-${kind}-${n + 1}.${kind === "video" ? "mp4" : "jpg"}`,
          mimeType: kind === "video" ? "video/mp4" : "image/jpeg",
          sizeBytes: 380_000 + n * 70_000,
          ...(kind === "video" ? VIDEO_DIMS : IMAGE_DIMS),
          altText: `${w.name} ${kind} ${n + 1}`,
        },
      });

    const images = [];
    for (let n = 0; n < 6; n++) images.push(await makeAsset(n, "image"));
    const videos = [];
    for (let n = 0; n < 2; n++) videos.push(await makeAsset(6 + n, "video"));

    const imageChannels = channels.filter((c) => !VIDEO_ONLY.has(c.platform));
    const videoChannels = channels.filter((c) => VIDEO_ONLY.has(c.platform));

    for (const [i, entry] of SCHEDULE.entries()) {
      const status = entry[0];
      const offset = entry[1];
      const topic = TOPICS[(wi * SCHEDULE.length + i) % TOPICS.length];
      const when = d(offset, 9 + (i % 8));
      // Every 4th post is a video post on the video-only platforms; the rest
      // go to the image-friendly ones. Never mixed — see VIDEO_ONLY above.
      const wantsVideo = videoChannels.length > 0 && i % 4 === 3;
      const pool = wantsVideo ? videoChannels : imageChannels;
      const subset = pool.length
        ? pool.slice(0, 1 + (i % pool.length))
        : channels.slice(0, 1);
      const asset = wantsVideo ? videos[i % videos.length] : images[i % images.length];
      const body = `${topic.charAt(0).toUpperCase()}${topic.slice(1)}.\n\nA short demo caption for ${w.name}.`;

      const post = await db.post.create({
        data: {
          workspaceId: ws.id,
          authorId: authors[i % authors.length],
          title: topic.charAt(0).toUpperCase() + topic.slice(1),
          status,
          scheduledAt: status === "draft" ? null : when,
          // Never date a publish in the future — today's post uses an hour that
          // may not have arrived yet, and a future publishedAt would be ignored
          // by the streak engine and look wrong in analytics.
          // Snap publishes to 15:00 UTC of the offset day. That is mid-day in
          // both the demo users' zone (America/New_York) and the seeding
          // machine's, so the calendar day is the same whoever is viewing —
          // otherwise the streak would split a run at a timezone boundary.
          // Clamped so today's post is never dated in the future.
          publishedAt: status === "published" ? publishInstant(offset) : null,
          isEvergreen: i % 4 === 0,
          channels: {
            create: subset.map((ch) => ({
              channelId: ch.id,
              platform: ch.platform,
              body,
              status: status === "published" ? "published" : status === "scheduled" ? "scheduled" : "pending",
              // `.example` is a reserved TLD — a demo link cannot be mistaken for real.
              publishedUrl: status === "published" ? `https://${ch.platform}.example/${ws.slug}/${i}` : null,
            })),
          },
        },
        include: { channels: true },
      });
      // Attach media so platform validation passes in the composer — Instagram
      // Feed and YouTube both require at least one item.
      if (asset) {
        await db.mediaOnPost.create({ data: { postId: post.id, mediaId: asset.id, order: 0 } });
      }
      posts++;

      if (status === "published") {
        for (const pc of post.channels) {
          const base = 4800 + (((wi + 1) * (i + 3) * 37) % 26000);
          const eng = Math.round(base * 0.06);
          await db.postMetric.create({
            data: {
              postId: post.id,
              postChannelId: pc.id,
              capturedAt: when,
              impressions: base,
              reach: Math.floor(base * 0.83),
              likes: Math.floor(eng * 0.72),
              comments: Math.floor(eng * 0.11),
              shares: Math.floor(eng * 0.07),
              saves: Math.floor(eng * 0.1),
              clicks: Math.floor(base * 0.028),
              videoViews: pc.platform === "youtube" ? Math.floor(base * 0.62) : 0,
              engagementRate: Number(((eng / base) * 100).toFixed(2)),
            },
          });
        }
      }
    }

    // Dashboard/analytics KPIs read MetricSnapshot (a daily time series), NOT
    // PostMetric — without these every chart and stat renders 0.
    // Two shapes are queried: workspace rollup (channelId null) when no
    // platform filter is active, and per-channel rows when one is.
    const snapshots = [];
    const baseFollowers = 8200 + wi * 5400;
    for (let back = SNAPSHOT_DAYS; back >= 0; back--) {
      const date = d(-back, 3);
      // Gentle upward trend plus a weekly ripple so charts look alive.
      const t = (SNAPSHOT_DAYS - back) / SNAPSHOT_DAYS;
      const wave = 1 + 0.14 * Math.sin((SNAPSHOT_DAYS - back) / 3.2);
      const followers = Math.round(baseFollowers * (1 + 0.38 * t));
      const reach = Math.round((2600 + wi * 900) * (1 + 0.5 * t) * wave);
      const engagement = Math.round(reach * 0.058 * wave);

      snapshots.push({
        workspaceId: ws.id, channelId: null, date,
        followers, reach, impressions: Math.round(reach * 1.32),
        engagement, clicks: Math.round(reach * 0.027),
        videoViews: Math.round(reach * 0.21), shares: Math.round(engagement * 0.07),
        saves: Math.round(engagement * 0.1), comments: Math.round(engagement * 0.11),
      });

      for (const [ci, ch] of channels.entries()) {
        const share = ci === 0 ? 0.52 : ci === 1 ? 0.31 : 0.17;
        const cReach = Math.round(reach * share);
        const cEng = Math.round(engagement * share);
        snapshots.push({
          workspaceId: ws.id, channelId: ch.id, date,
          followers: Math.round(followers * share), reach: cReach,
          impressions: Math.round(cReach * 1.32), engagement: cEng,
          clicks: Math.round(cReach * 0.027),
          videoViews: ch.platform === "youtube" ? Math.round(cReach * 0.44) : 0,
          shares: Math.round(cEng * 0.07), saves: Math.round(cEng * 0.1),
          comments: Math.round(cEng * 0.11),
        });
      }
    }
    await db.metricSnapshot.createMany({ data: snapshots });
    snapshotRows += snapshots.length;

    // Without a HealthScore row the dashboard ring reads a flat 0.
    await db.healthScore.create({
      data: {
        workspaceId: ws.id, date: d(0, 4),
        score: 78 - wi * 6, consistency: 82 - wi * 5, engagement: 74 - wi * 4,
        growth: 80 - wi * 7, responseSpeed: 69 + wi * 3, diversity: 71 + wi * 2,
        trend: 4 - wi,
      },
    });
  }

  console.log(`\nCreated: org + ${USERS.length} users + ${WORKSPACES.length} workspaces + ${posts} posts + ${snapshotRows} metric snapshots.`);
  console.log(`Sign in:  ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log("Remove later with: node scripts/purge-demo-data.mjs --execute");
}

await main();
await db.$disconnect();
