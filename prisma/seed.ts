import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  PLAN_CATALOG,
  IDEA_STAGES,
  type PlatformKey,
} from "../src/lib/constants";
import {
  generateInsights,
  predictPerformance,
  detectSentiment,
} from "../src/lib/adapters/ai";

const db = new PrismaClient();

const day = 86_400_000;
const now = Date.now();
const d = (offsetDays: number, hour = 10) => {
  const x = new Date(now + offsetDays * day);
  x.setHours(hour, 0, 0, 0);
  return x;
};
const rand = (seed: number) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};
const pickN = <T,>(arr: T[], n: number, s: number) =>
  [...arr].sort((a, b) => rand(s + arr.indexOf(a)) - rand(s + arr.indexOf(b))).slice(0, n);

async function main() {
  console.info("· resetting");
  // Clear in FK-safe order (SQLite: just delete all, children first-ish).
  const tables = [
    "webhookDelivery", "webhook", "apiKey", "invoice", "usageRecord",
    "auditLog", "systemEvent", "supportTicket", "notification", "notificationPref",
    "postMetric", "metricSnapshot", "postPrediction", "healthScore", "contentGoal",
    "report", "insight", "trend", "competitorPost", "competitor", "opportunity",
    "automationRun", "automation", "recycleRule",
    "approvalAction", "approvalRequest", "approvalStage", "approvalFlow",
    "message", "conversation", "savedReply", "threadComment", "activityEvent",
    "publishJob",
    "mediaOnPost", "tagOnPost", "tagOnIdea", "tagOnMedia",
    "postVersion", "postChannel", "post", "contentIdea",
    "template", "campaign", "contentPillar", "tag",
    "mediaAsset", "mediaFolder",
    "queueSlot", "socialChannel", "socialAccount",
    "brandSource", "workspaceMember", "workspace",
    "subscription", "membership", "organization",
    "session", "account", "device", "verificationToken", "user", "plan", "featureFlag",
  ];
  for (const t of tables) {
    // @ts-expect-error dynamic table access
    await db[t].deleteMany();
  }

  console.info("· plans + flags");
  for (const [i, p] of PLAN_CATALOG.entries()) {
    await db.plan.create({
      data: {
        key: p.key,
        name: p.name,
        priceMonthly: p.priceMonthly,
        priceAnnual: p.priceAnnual,
        maxChannels: p.maxChannels,
        maxUsers: p.maxUsers,
        maxScheduled: p.maxScheduled,
        aiCredits: p.aiCredits,
        storageMb: p.storageMb,
        features: JSON.stringify(p.features),
        sortIndex: i,
      },
    });
  }
  for (const f of [
    { key: "ai_agent", description: "Autonomous AI social media agent", enabled: true, rollout: 100 },
    { key: "competitor_intel", description: "Competitor tracking module", enabled: true, rollout: 100 },
    { key: "white_label_reports", description: "White-label PDF reports", enabled: true, rollout: 100 },
    { key: "predictive_scoring", description: "Pre-publish performance prediction", enabled: true, rollout: 100 },
    { key: "trends_v2", description: "Trend Explorer v2", enabled: false, rollout: 15 },
  ]) {
    await db.featureFlag.create({ data: f });
  }

  console.info("· users");
  const hash = await bcrypt.hash("demo1234", 10);
  const rp = (g: "men" | "women", n: number) => `https://randomuser.me/api/portraits/${g}/${n}.jpg`;
  const demo = await db.user.create({
    data: {
      email: "demo@multipoststudio.app",
      name: "Avery Quinn",
      image: rp("women", 44),
      passwordHash: hash,
      emailVerified: new Date(),
      isPlatformAdmin: true,
      timezone: "America/New_York",
      notificationPref: { create: {} },
    },
  });
  const maya = await db.user.create({
    data: { email: "maya@multipoststudio.app", name: "Maya Osei", image: rp("women", 68), passwordHash: hash, emailVerified: new Date(), notificationPref: { create: {} } },
  });
  const leo = await db.user.create({
    data: { email: "leo@multipoststudio.app", name: "Leo Marchetti", image: rp("men", 32), passwordHash: hash, emailVerified: new Date(), notificationPref: { create: {} } },
  });
  const client = await db.user.create({
    data: { email: "client@alpine.coffee", name: "Dana Reyes", image: rp("men", 75), passwordHash: hash, emailVerified: new Date(), notificationPref: { create: {} } },
  });

  await db.device.createMany({
    data: [
      { userId: demo.id, label: "MacBook Pro · Chrome", userAgent: "Chrome/141 macOS", ip: "73.12.44.9", lastSeenAt: new Date() },
      { userId: demo.id, label: "iPhone 16 · MultiPost Studio iOS", userAgent: "MultiPostStudioiOS/3.2", ip: "73.12.44.9", lastSeenAt: d(-1) },
    ],
  });

  console.info("· organization + subscription");
  const org = await db.organization.create({
    data: { name: "Northwind Studio", slug: "northwind-studio", type: "agency" },
  });
  await db.membership.createMany({
    data: [
      { orgId: org.id, userId: demo.id, role: "owner" },
      { orgId: org.id, userId: maya.id, role: "manager" },
      { orgId: org.id, userId: leo.id, role: "editor" },
      { orgId: org.id, userId: client.id, role: "viewer" },
    ],
  });
  const agencyPlan = await db.plan.findUniqueOrThrow({ where: { key: "agency" } });
  await db.subscription.create({
    data: {
      orgId: org.id,
      planId: agencyPlan.id,
      status: "active",
      interval: "month",
      currentPeriodEnd: d(21),
      stripeCustomerId: "cus_stub_northwind",
      stripeSubscriptionId: "sub_stub_northwind",
    },
  });

  const month = new Date().toISOString().slice(0, 7);
  await db.usageRecord.createMany({
    data: [
      { orgId: org.id, metric: "ai_credits", value: 3120, periodMonth: month },
      { orgId: org.id, metric: "scheduled_posts", value: 148, periodMonth: month },
      { orgId: org.id, metric: "storage_mb", value: 8400, periodMonth: month },
      { orgId: org.id, metric: "api_calls", value: 21873, periodMonth: month },
      { orgId: org.id, metric: "channels", value: 11, periodMonth: month },
      { orgId: org.id, metric: "users", value: 4, periodMonth: month },
    ],
  });
  for (let i = 3; i >= 1; i--) {
    await db.invoice.create({
      data: {
        orgId: org.id,
        number: `MPS-2026-000${i}`,
        amountDue: 12900,
        status: "paid",
        periodStart: d(-30 * (i + 1)),
        periodEnd: d(-30 * i),
      },
    });
  }

  console.info("· api keys, webhooks, tickets, audit");
  await db.apiKey.create({
    data: {
      orgId: org.id,
      name: "Production key",
      prefix: "mps_live_8fx2",
      hashedKey: await bcrypt.hash("mps_live_8fx2_secretpart", 10),
      scopes: JSON.stringify(["posts:read", "posts:write", "analytics:read"]),
      lastUsedAt: d(-1),
    },
  });
  const wh = await db.webhook.create({
    data: {
      orgId: org.id,
      url: "https://hooks.northwind.studio/cadence",
      events: JSON.stringify(["post.published", "post.failed", "approval.requested"]),
      secret: "whsec_stub_northwind",
    },
  });
  for (let i = 0; i < 6; i++) {
    await db.webhookDelivery.create({
      data: {
        webhookId: wh.id,
        event: i % 3 === 0 ? "post.failed" : "post.published",
        payload: JSON.stringify({ demo: true, i }),
        statusCode: i === 2 ? 500 : 200,
        success: i !== 2,
        createdAt: d(-i),
      },
    });
  }
  await db.supportTicket.createMany({
    data: [
      { orgId: org.id, userId: demo.id, subject: "Instagram reconnect keeps failing", body: "Token expires every few hours on the Alpine account.", status: "open", priority: "high" },
      { orgId: org.id, userId: maya.id, subject: "Feature request: bulk CSV import", body: "Would love to import a content calendar from CSV.", status: "pending", priority: "normal" },
    ],
  });
  await db.auditLog.createMany({
    data: [
      { orgId: org.id, actorId: demo.id, action: "member.invited", targetType: "user", targetId: leo.id, createdAt: d(-12) },
      { orgId: org.id, actorId: demo.id, action: "billing.plan_changed", targetType: "subscription", targetId: "sub_stub_northwind", metadata: JSON.stringify({ planKey: "agency" }), createdAt: d(-30) },
      { orgId: org.id, actorId: maya.id, action: "channel.connected", targetType: "socialAccount", targetId: "seed", createdAt: d(-8) },
    ],
  });
  await db.systemEvent.createMany({
    data: [
      { level: "info", source: "queue", message: "Processed 12 due publish jobs" },
      { level: "warn", source: "webhook", message: "Delivery to hooks.northwind.studio returned 500 (retry scheduled)" },
      { level: "info", source: "billing", message: "Invoice MPS-2026-0003 marked paid" },
      { level: "error", source: "auth", message: "3 failed login attempts for client@alpine.coffee" },
    ],
  });
  await db.notification.createMany({
    data: [
      { userId: demo.id, type: "approval_request", title: "Approval needed", body: "Maya sent \"Spring launch teaser\" for your review.", linkUrl: "/approvals", createdAt: d(0, 8) },
      { userId: demo.id, type: "engagement_alert", title: "Post trending", body: "\"5 pour-over mistakes\" is outperforming your average by 3.1x.", linkUrl: "/analytics/content", createdAt: d(0, 9) },
      { userId: demo.id, type: "insight", title: "New weekly insight", body: "Educational carousels drive 42% more saves.", linkUrl: "/insights", createdAt: d(-1, 9), readAt: d(-1, 12) },
    ],
  });

  // ---------- Workspace factory ----------
  const PLATFORMS_BY_WS: Record<string, PlatformKey[]> = {
    "Northwind Brand": ["instagram", "linkedin", "x", "tiktok"],
    "Alpine Coffee": ["instagram", "facebook", "tiktok", "pinterest"],
    "Fitwave": ["instagram", "youtube", "x", "threads"],
  };

  const workspaceDefs = [
    { name: "Northwind Brand", slug: "northwind-brand", kind: "brand", clientName: null, industry: "Agency / Marketing", voice: "Confident, plainspoken, a little witty. Short sentences. No jargon.", colors: ["#4f46e5", "#0ea5e9", "#f59e0b"], site: "https://northwind.studio" },
    { name: "Alpine Coffee", slug: "alpine-coffee", kind: "client", clientName: "Alpine Coffee Roasters", industry: "Food & Beverage", voice: "Warm, sensory, unpretentious. Talk about craft without being snobby.", colors: ["#7c2d12", "#c2410c", "#fed7aa"], site: "https://alpine.coffee" },
    { name: "Fitwave", slug: "fitwave", kind: "client", clientName: "Fitwave App", industry: "Health / Wellness", voice: "Energetic, encouraging, science-backed. Motivate without hype.", colors: ["#059669", "#10b981", "#a7f3d0"], site: "https://fitwave.app" },
  ];

  for (const [wi, wdef] of workspaceDefs.entries()) {
    console.info(`· workspace: ${wdef.name}`);
    const ws = await db.workspace.create({
      data: {
        orgId: org.id,
        name: wdef.name,
        slug: wdef.slug,
        kind: wdef.kind,
        clientName: wdef.clientName,
        industry: wdef.industry,
        brandVoice: wdef.voice,
        brandColors: JSON.stringify(wdef.colors),
        websiteUrl: wdef.site,
        brandBrain:
          "Prefer concrete examples over abstractions. Keep paragraphs to 2 lines. Always close with a light CTA. Avoid buzzwords: 'synergy', 'leverage', 'game-changer'.",
      },
    });

    await db.workspaceMember.createMany({
      data: [
        { workspaceId: ws.id, userId: demo.id, role: "manager" },
        { workspaceId: ws.id, userId: maya.id, role: "editor" },
        { workspaceId: ws.id, userId: leo.id, role: "creator" },
        ...(wdef.kind === "client" ? [{ workspaceId: ws.id, userId: client.id, role: "client" }] : []),
      ],
    });

    await db.brandSource.createMany({
      data: [
        { workspaceId: ws.id, kind: "website", title: `${wdef.site} — homepage`, content: `${wdef.name} helps people ${wi === 1 ? "brew better coffee at home" : wi === 2 ? "build a lasting workout habit" : "run social media that actually moves numbers"}.`, status: "ready" },
        { workspaceId: ws.id, kind: "guidelines", title: "Brand voice guide", content: wdef.voice, status: "ready" },
        { workspaceId: ws.id, kind: "past_posts", title: "Top 20 posts (last quarter)", content: "Educational carousels and behind-the-scenes video consistently outperform product shots. Casual, friendly tone.", status: "ready" },
      ],
    });

    // Pillars
    const pillarNames = [
      { name: "Educational", color: "#0ea5e9", pct: 40 },
      { name: "Behind the scenes", color: "#8b5cf6", pct: 25 },
      { name: "Social proof", color: "#10b981", pct: 20 },
      { name: "Promotional", color: "#f59e0b", pct: 15 },
    ];
    const pillars = [];
    for (const p of pillarNames) {
      pillars.push(await db.contentPillar.create({ data: { workspaceId: ws.id, name: p.name, color: p.color, targetPercent: p.pct } }));
    }

    // Tags
    const tagNames = ["evergreen", "launch", "UGC", "seasonal", "howto", "announcement"];
    const tags = [];
    for (const t of tagNames) {
      tags.push(await db.tag.create({ data: { workspaceId: ws.id, name: t } }));
    }

    // Campaigns
    const camp1 = await db.campaign.create({
      data: { workspaceId: ws.id, name: wi === 1 ? "Spring Roast Launch" : wi === 2 ? "New Year, New Wave" : "Q2 Brand Refresh", objective: "launch", status: "active", startDate: d(-10), endDate: d(20), goalPosts: 24, goalEngagement: 5000 },
    });
    const camp2 = await db.campaign.create({
      data: { workspaceId: ws.id, name: "Always-on Education", objective: "engagement", status: "active", startDate: d(-60), endDate: d(60), goalPosts: 40 },
    });

    // Templates
    await db.template.createMany({
      data: [
        { workspaceId: ws.id, name: "Educational carousel", category: "education", body: "Hook\n\n1. Point one\n2. Point two\n3. Point three\n\nSave this ↓", platforms: JSON.stringify(["instagram", "linkedin"]) },
        { workspaceId: ws.id, name: "Product drop", category: "promo", body: "It's here: {product}\n\nWhat makes it different:\n- {benefit}\n\nLink in bio.", platforms: JSON.stringify(["instagram", "facebook"]) },
      ],
    });

    // Social accounts + channels
    const platforms = PLATFORMS_BY_WS[wdef.name];
    const channels = [];
    for (const plat of platforms) {
      const acct = await db.socialAccount.create({
        data: {
          workspaceId: ws.id,
          platform: plat,
          displayName: wdef.name,
          handle: `@${wdef.slug.replace(/-/g, "")}`,
          status: plat === "tiktok" && wi === 1 ? "expired" : "connected",
          tokenExpiresAt: d(30),
          scopes: "read,write",
          lastSyncedAt: d(0, 6),
        },
      });
      const ch = await db.socialChannel.create({
        data: {
          workspaceId: ws.id,
          socialAccountId: acct.id,
          platform: plat,
          name: wdef.name,
          handle: `@${wdef.slug.replace(/-/g, "")}`,
          followerCount: 2000 + Math.floor(rand(wi * 10 + platforms.indexOf(plat)) * 40000),
          timezone: "America/New_York",
        },
      });
      channels.push(ch);
      // queue slots: Mon/Wed/Fri 9:00 & 17:00
      for (const wd of [1, 3, 5]) {
        for (const hr of [9, 17]) {
          await db.queueSlot.create({ data: { workspaceId: ws.id, channelId: ch.id, weekday: wd, hour: hr } });
        }
      }
    }

    // Media folders + assets
    const folder = await db.mediaFolder.create({ data: { workspaceId: ws.id, name: "Campaign assets" } });
    await db.mediaFolder.create({ data: { workspaceId: ws.id, name: "Brand kit" } });
    const media = [];
    for (let i = 0; i < 10; i++) {
      const kind = i % 4 === 0 ? "video" : "image";
      // Local, on-brand cover art (public/media/cover-NN.svg) — no network placeholders.
      const cover = `/media/cover-${String(((wdef.slug.length + i) % 12) + 1).padStart(2, "0")}.svg`;
      media.push(
        await db.mediaAsset.create({
          data: {
            workspaceId: ws.id,
            folderId: i < 5 ? folder.id : null,
            uploaderId: [demo.id, maya.id, leo.id][i % 3],
            kind,
            url: cover,
            thumbUrl: cover,
            filename: `${wdef.slug}-${kind}-${i + 1}.${kind === "video" ? "mp4" : "jpg"}`,
            mimeType: kind === "video" ? "video/mp4" : "image/jpeg",
            sizeBytes: 400_000 + i * 90_000,
            width: 1080,
            height: 1080,
            durationSec: kind === "video" ? 18 + i : null,
            altText: `${wdef.name} ${kind} asset ${i + 1}`,
            aiDescription: `A ${kind} for ${wdef.name}: clean composition, brand colors, single focal point.`,
            favorite: i < 2,
            hash: `hash_${wdef.slug}_${i}`,
          },
        }),
      );
    }

    // Approval flow
    const flow = await db.approvalFlow.create({
      data: {
        workspaceId: ws.id,
        name: "Standard review",
        isDefault: true,
        stages: {
          create: [
            { order: 0, name: "Editor review", roleGate: "editor" },
            { order: 1, name: "Manager sign-off", roleGate: "manager" },
            ...(wdef.kind === "client" ? [{ order: 2, name: "Client approval", roleGate: "client" }] : []),
          ],
        },
      },
      include: { stages: true },
    });

    // Saved replies
    await db.savedReply.createMany({
      data: [
        { workspaceId: ws.id, title: "Thanks", body: "Thanks so much for the support — means a lot! 🙌" },
        { workspaceId: ws.id, title: "Shipping question", body: "Orders ship in 2–3 business days. You'll get tracking by email." },
        { workspaceId: ws.id, title: "Where to buy", body: "Everything's linked in our bio — let us know if you can't find it!" },
        { workspaceId: ws.id, title: "Apology", body: "So sorry about this. DMing you now so we can make it right." },
      ],
    });

    // Ideas across stages
    const ideaTopics = [
      "pour-over ratios explained", "our roasting process on film", "customer latte art wall",
      "spring blend flavor notes", "espresso myths debunked", "cafe playlist drop",
      "5 gym bag essentials", "form check: the deadlift", "why rest days grow muscle",
      "member transformation story", "agency onboarding checklist", "content calendar teardown",
    ];
    for (let i = 0; i < ideaTopics.length; i++) {
      const stage = IDEA_STAGES[i % IDEA_STAGES.length];
      const idea = await db.contentIdea.create({
        data: {
          workspaceId: ws.id,
          authorId: [demo.id, maya.id, leo.id][i % 3],
          title: ideaTopics[i],
          notes: `Angle: ${["educational", "behind the scenes", "social proof"][i % 3]}. Keep it short.`,
          kind: i % 5 === 0 ? "link" : i % 3 === 0 ? "video" : "text",
          url: i % 5 === 0 ? "https://example.com/reference" : null,
          stage,
          pillarId: pillars[i % pillars.length].id,
          campaignId: i % 2 === 0 ? camp1.id : camp2.id,
          sortIndex: i,
        },
      });
      if (i % 3 === 0) {
        await db.tagOnIdea.create({ data: { ideaId: idea.id, tagId: tags[i % tags.length].id } });
      }
    }

    // Posts
    const postDefs = [
      ...Array.from({ length: 8 }, (_, i) => ({ status: "published", offset: -2 - i * 3 })),
      ...Array.from({ length: 6 }, (_, i) => ({ status: "scheduled", offset: 1 + i * 2 })),
      { status: "awaiting_approval", offset: 2 },
      { status: "awaiting_approval", offset: 4 },
      { status: "draft", offset: 0 },
      { status: "draft", offset: 0 },
      { status: "approved", offset: 3 },
      { status: "failed", offset: -1 },
    ];

    for (let i = 0; i < postDefs.length; i++) {
      const pd = postDefs[i];
      const topic = ideaTopics[i % ideaTopics.length];
      const body = `${["Most people get this wrong:", "Quick one:", "Here's what we learned:"][i % 3]} ${topic}.\n\nThe short version: consistency beats intensity. Do the simple thing weekly and measure what happens.\n\nSave this for later ↓`;
      const chSubset = pickN(channels, 1 + (i % 2), wi * 100 + i);
      const scheduledAt = pd.status === "scheduled" || pd.status === "approved" ? d(pd.offset, 9 + (i % 8)) : null;
      const publishedAt = pd.status === "published" ? d(pd.offset, 9 + (i % 8)) : null;

      const post = await db.post.create({
        data: {
          workspaceId: ws.id,
          authorId: [demo.id, maya.id, leo.id][i % 3],
          campaignId: i % 2 === 0 ? camp1.id : camp2.id,
          pillarId: pillars[i % pillars.length].id,
          title: topic.charAt(0).toUpperCase() + topic.slice(1),
          status: pd.status,
          scheduledAt,
          publishedAt,
          isEvergreen: i % 4 === 0,
          firstComment: i % 3 === 0 ? "More on this in the comments 👇" : null,
          utmSource: i % 2 === 0 ? "instagram" : null,
          utmCampaign: i % 2 === 0 ? camp1.name.toLowerCase().replace(/\s+/g, "-") : null,
          channels: {
            create: chSubset.map((ch) => ({
              channelId: ch.id,
              platform: ch.platform,
              body,
              status:
                pd.status === "published" ? "published" : pd.status === "failed" ? "failed" : pd.status === "scheduled" ? "scheduled" : "pending",
              publishedUrl: pd.status === "published" ? `https://${ch.platform}.example/${ws.slug}/${i}` : null,
              error: pd.status === "failed" ? "Platform API rejected the request (simulated)." : null,
            })),
          },
        },
        include: { channels: true },
      });

      // media link
      if (i % 2 === 0) {
        await db.mediaOnPost.create({ data: { postId: post.id, mediaId: media[i % media.length].id, order: 0 } });
      }
      // tag
      await db.tagOnPost.create({ data: { postId: post.id, tagId: tags[i % tags.length].id } });

      // version history
      await db.postVersion.create({
        data: { postId: post.id, authorId: post.authorId, version: 1, snapshot: JSON.stringify({ body }), note: "Initial draft" },
      });
      if (pd.status !== "draft") {
        await db.postVersion.create({
          data: { postId: post.id, authorId: maya.id, version: 2, snapshot: JSON.stringify({ body: body + "\n\n(edited)" }), note: "Tightened hook" },
        });
      }

      // prediction
      const pred = predictPerformance({ body, platform: chSubset[0].platform as PlatformKey, hasMedia: i % 2 === 0 });
      await db.postPrediction.create({
        data: {
          postId: post.id,
          engagementScore: pred.engagementScore,
          clarityScore: pred.clarityScore,
          hookStrength: pred.hookStrength,
          readability: pred.readability,
          ctaScore: pred.ctaScore,
          brandVoiceScore: pred.brandVoiceScore,
          platformFitScore: pred.platformFitScore,
          recommendations: JSON.stringify(pred.recommendations),
          actualEngagementRate: pd.status === "published" ? Number((2 + rand(i) * 6).toFixed(2)) : null,
          comparedAt: pd.status === "published" ? publishedAt : null,
        },
      });

      // metrics for published
      if (pd.status === "published") {
        for (const pc of post.channels) {
          const base = 600 + Math.floor(rand(wi * 50 + i) * 8000);
          const eng = Math.floor(base * (0.02 + rand(i + 7) * 0.09));
          await db.postMetric.create({
            data: {
              postId: post.id,
              postChannelId: pc.id,
              impressions: base,
              reach: Math.floor(base * 0.83),
              likes: Math.floor(eng * 0.72),
              comments: Math.floor(eng * 0.11),
              shares: Math.floor(eng * 0.07),
              saves: Math.floor(eng * 0.1),
              clicks: Math.floor(base * 0.028),
              videoViews: pc.platform === "youtube" || pc.platform === "tiktok" ? Math.floor(base * 0.62) : 0,
              engagementRate: Number(((eng / base) * 100).toFixed(2)),
            },
          });
        }
        await db.post.update({ where: { id: post.id }, data: { aiPredictionScore: pred.engagementScore } });
      }

      // publish job for scheduled
      if (pd.status === "scheduled" && scheduledAt) {
        await db.publishJob.create({ data: { postId: post.id, runAt: scheduledAt, status: "queued" } });
      }

      // approval requests
      if (pd.status === "awaiting_approval") {
        const areq = await db.approvalRequest.create({
          data: { flowId: flow.id, postId: post.id, currentStage: 0, status: "in_review" },
        });
        await db.approvalAction.create({
          data: { requestId: areq.id, stageId: flow.stages[0].id, actorId: leo.id, action: "comment", comment: "Ready for review — hook could be punchier?" },
        });
        await db.notification.create({
          data: { userId: demo.id, type: "approval_request", title: "Approval needed", body: `"${post.title}" is waiting on your review.`, linkUrl: "/approvals" },
        });
      }

      // thread comments
      if (i % 3 === 0) {
        await db.threadComment.create({ data: { postId: post.id, authorId: maya.id, body: "Can we swap the image for the carousel version?" } });
        await db.threadComment.create({ data: { postId: post.id, authorId: leo.id, body: "Done — updated in v2.", resolved: true } });
      }

      // activity
      await db.activityEvent.create({
        data: {
          workspaceId: ws.id,
          actorId: post.authorId,
          verb: pd.status === "published" ? "published" : pd.status === "scheduled" ? "scheduled" : "created",
          entityType: "post",
          entityId: post.id,
          summary: `${pd.status === "published" ? "Published" : pd.status === "scheduled" ? "Scheduled" : "Drafted"} "${post.title}"`,
          createdAt: publishedAt ?? scheduledAt ?? d(-i),
        },
      });
    }

    // Conversations
    const convSeeds = [
      { type: "comment", author: "coffee_nerd_42", text: "This changed how I brew every morning. Thank you!", },
      { type: "comment", author: "miksdesign", text: "Wait the ratio is 1:16? I've been doing 1:12 this whole time 😳" },
      { type: "dm", author: "sarah.k", text: "Do you ship to Canada? Can't find it at checkout." },
      { type: "mention", author: "brewguide", text: "Great breakdown from @northwind on pour-over — worth a follow." },
      { type: "comment", author: "angry_customer", text: "Order arrived broken and support hasn't replied in 3 days. Not good." },
      { type: "review", author: "James P.", text: "Best subscription I've tried. 5 stars.", rating: 5 },
      { type: "comment", author: "fit_with_jo", text: "Is this beginner friendly? Never lifted before." },
      { type: "dm", author: "leadgen_dan", text: "Interested in a partnership — who do I talk to?" },
      { type: "comment", author: "skeptic99", text: "Sounds like marketing fluff tbh" },
      { type: "review", author: "Nina R.", text: "App is fine but the reminders are too aggressive.", rating: 3 },
    ];
    for (let i = 0; i < convSeeds.length; i++) {
      const cs = convSeeds[i];
      const sentiment = detectSentiment(cs.text);
      const conv = await db.conversation.create({
        data: {
          workspaceId: ws.id,
          channelId: channels[i % channels.length].id,
          platform: channels[i % channels.length].platform,
          type: cs.type,
          externalId: `ext_${ws.slug}_${i}`,
          authorName: cs.author,
          authorHandle: "@" + cs.author.replace(/[^a-z0-9]/gi, ""),
          preview: cs.text.slice(0, 120),
          status: i < 4 ? "open" : i < 7 ? "pending" : "done",
          sentiment,
          priority: sentiment === "negative" ? 3 : cs.type === "dm" ? 2 : 1,
          assigneeId: i % 3 === 0 ? maya.id : null,
          labels: JSON.stringify(sentiment === "negative" ? ["needs attention"] : []),
          rating: "rating" in cs ? (cs as { rating: number }).rating : null,
          lastMessageAt: d(-Math.floor(i / 2), 12),
        },
      });
      await db.message.create({
        data: { conversationId: conv.id, direction: "inbound", authorName: cs.author, body: cs.text, createdAt: d(-Math.floor(i / 2), 12) },
      });
      if (i < 3) {
        await db.message.create({
          data: { conversationId: conv.id, direction: "outbound", authorName: "Northwind", body: "Thanks so much — really appreciate you sharing this!", createdAt: d(-Math.floor(i / 2), 13) },
        });
      }
    }

    // Automations
    await db.automation.createMany({
      data: [
        { workspaceId: ws.id, name: "Alert on publish failures", triggerType: "post_published", triggerConfig: JSON.stringify({}), actionType: "notify", actionConfig: JSON.stringify({ channel: "in_app" }), runCount: 4, lastRunAt: d(-1) },
        { workspaceId: ws.id, name: "Tag high performers", triggerType: "high_engagement", triggerConfig: JSON.stringify({ threshold: 5 }), actionType: "tag_high_performer", actionConfig: JSON.stringify({ tag: "evergreen" }), runCount: 11, lastRunAt: d(-2) },
        { workspaceId: ws.id, name: "AI-optimize new drafts", triggerType: "draft_created", triggerConfig: JSON.stringify({}), actionType: "run_ai_optimize", actionConfig: JSON.stringify({}), enabled: false, runCount: 0 },
      ],
    });
    const autos = await db.automation.findMany({ where: { workspaceId: ws.id } });
    for (const a of autos.slice(0, 2)) {
      await db.automationRun.createMany({
        data: [
          { automationId: a.id, status: "success", detail: "Matched 1 post, sent notification", createdAt: d(-1) },
          { automationId: a.id, status: "skipped", detail: "No matching entity", createdAt: d(-3) },
        ],
      });
    }

    // Recycle rule
    await db.recycleRule.create({
      data: { workspaceId: ws.id, name: "Evergreen education", frequencyDays: 30, maxReposts: 4, minGapDays: 21, expiresAt: d(180) },
    });

    // Metric snapshots (60 days)
    let followers = channels.reduce((s, c) => s + c.followerCount, 0);
    for (let i = 60; i >= 0; i--) {
      followers += Math.floor((rand(wi * 200 + i) - 0.35) * 60);
      await db.metricSnapshot.create({
        data: {
          workspaceId: ws.id,
          date: d(-i, 0),
          followers,
          reach: 8000 + Math.floor(rand(i) * 12000),
          impressions: 14000 + Math.floor(rand(i + 1) * 22000),
          engagement: 500 + Math.floor(rand(i + 2) * 1400),
          clicks: 120 + Math.floor(rand(i + 3) * 400),
          videoViews: 3000 + Math.floor(rand(i + 4) * 9000),
          shares: 40 + Math.floor(rand(i + 5) * 160),
          saves: 60 + Math.floor(rand(i + 6) * 240),
          comments: 30 + Math.floor(rand(i + 7) * 120),
        },
      });
    }

    // Insights
    const ins = generateInsights({ workspaceName: ws.name, topFormat: "educational carousel", bestHour: 19, growthTrend: wi === 2 ? -4.2 : 6.4 });
    for (const x of ins) {
      await db.insight.create({ data: { workspaceId: ws.id, category: x.category, severity: x.severity, what: x.what, why: x.why, action: x.action, metricDelta: x.metricDelta } });
    }

    // Trends
    const trendTopics = wi === 1
      ? ["Cold brew concentrate at home", "Manual espresso levers", "Coffee + travel reels", "Single-origin storytelling", "Cafe ASMR"]
      : wi === 2
        ? ["12-3-30 walking workout", "Zone 2 cardio", "Protein-forward breakfasts", "Habit-stacking", "Deload weeks"]
        : ["Founder-led content", "Newsletter-to-social repurposing", "Short-form docu style", "Comment-bait carousels", "AI disclosure posts"];
    for (let i = 0; i < trendTopics.length; i++) {
      await db.trend.create({
        data: {
          workspaceId: ws.id,
          topic: trendTopics[i],
          category: ["topic", "format", "keyword", "industry", "format"][i],
          momentum: 55 + Math.floor(rand(wi + i) * 40),
          summary: `${trendTopics[i]} is gaining traction with your audience segment over the last 2 weeks.`,
          suggestion: i % 2 === 0 ? `Draft a short-form video on "${trendTopics[i]}" this week.` : null,
        },
      });
    }

    // Competitors
    const compNames = wi === 1
      ? [["Blue Ridge Roasters", "blueridge"], ["Daily Grind Co", "dailygrind"], ["Ember Coffee", "emberco"]]
      : wi === 2
        ? [["PulseFit", "pulsefit"], ["MoveDaily", "movedaily"], ["StrongStart", "strongstart"]]
        : [["Loop Agency", "loopagency"], ["Brightwave", "brightwave"], ["North & Co", "northandco"]];
    for (const [nm, hd] of compNames) {
      const comp = await db.competitor.create({
        data: {
          workspaceId: ws.id,
          name: nm,
          handle: "@" + hd,
          platform: "instagram",
          followerCount: 12000 + Math.floor(rand(nm.length) * 60000),
          postsPerWeek: Number((3 + rand(nm.length) * 6).toFixed(1)),
          avgEngagement: Number((1.5 + rand(nm.length + 1) * 4).toFixed(2)),
          aiSummary: `${nm} posts mostly ${["carousels", "reels", "single images"][nm.length % 3]}, heaviest on weekdays. Their best content is educational; product posts underperform.`,
        },
      });
      for (let i = 0; i < 4; i++) {
        await db.competitorPost.create({
          data: {
            competitorId: comp.id,
            format: ["carousel", "reel", "image", "carousel"][i],
            caption: `${nm} post ${i + 1}: tips on ${trendTopics[i % trendTopics.length]}`,
            engagement: 300 + Math.floor(rand(nm.length + i) * 4000),
            postedAt: d(-2 - i * 3),
          },
        });
      }
    }

    // Opportunities
    const oppSeeds = [
      { title: `You haven't posted about "${trendTopics[0]}" — competitors have 6 posts`, type: "gap", score: 82 },
      { title: "Carousels are 12% of your mix but 38% of your saves — make more", type: "format", score: 74 },
      { title: "No content answers your top DM question about shipping", type: "topic", score: 68 },
      { title: `Repurpose "${ideaTopics[0]}" — it's your #2 post ever`, type: "repurpose", score: 61 },
    ];
    for (const o of oppSeeds) {
      await db.opportunity.create({ data: { workspaceId: ws.id, title: o.title, type: o.type, score: o.score, rationale: "Based on your last 90 days of performance and audience signals.", status: "open" } });
    }

    // Content goals
    await db.contentGoal.createMany({
      data: [
        { workspaceId: ws.id, metric: "posts_per_week", target: 5, period: "weekly", current: 4 },
        { workspaceId: ws.id, metric: "follower_growth", target: 800, period: "monthly", current: 512 },
        { workspaceId: ws.id, metric: "engagement_rate", target: 4.5, period: "monthly", current: 3.9 },
      ],
    });

    // Health scores (7 days)
    for (let i = 7; i >= 0; i--) {
      const consistency = 70 + Math.floor(rand(wi + i) * 20);
      const engagement = 60 + Math.floor(rand(wi + i + 1) * 25);
      const growth = 55 + Math.floor(rand(wi + i + 2) * 30);
      const responseSpeed = 65 + Math.floor(rand(wi + i + 3) * 25);
      const diversity = 60 + Math.floor(rand(wi + i + 4) * 25);
      const trend = 58 + Math.floor(rand(wi + i + 5) * 28);
      await db.healthScore.create({
        data: {
          workspaceId: ws.id,
          date: d(-i, 0),
          score: Math.round((consistency + engagement + growth + responseSpeed + diversity + trend) / 6),
          consistency, engagement, growth, responseSpeed, diversity, trend,
        },
      });
    }

    // Report
    await db.report.create({
      data: {
        workspaceId: ws.id,
        name: `${ws.name} — Monthly performance`,
        config: JSON.stringify({
          dateRange: "last_30_days",
          branding: { logo: true, color: wdef.colors[0] },
          widgets: ["followers_growth", "top_posts", "engagement_by_format", "platform_comparison"],
        }),
        schedule: "monthly",
        shareToken: `rpt_${ws.slug}_${wi}`,
        lastRunAt: d(-2),
      },
    });
  }

  console.info("✓ seed complete");
  console.info("  login: demo@multipoststudio.app / demo1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
