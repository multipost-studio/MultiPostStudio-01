/**
 * Purge seeded demo data from a real deployment.
 *
 *   node scripts/purge-demo-data.mjs            # DRY RUN — prints what it would delete
 *   node scripts/purge-demo-data.mjs --execute  # actually deletes
 *
 * Scope is deliberately narrow and explicit: the single seeded org
 * ("northwind-studio") and the four seeded demo users. Anything else — real
 * signups, their orgs/workspaces, real OAuth connections, the Plan catalog and
 * CMS content — is left untouched.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const EXECUTE = process.argv.includes("--execute");

const DEMO_ORG_SLUG = "northwind-studio";
const DEMO_USER_EMAILS = [
  "demo@multipoststudio.app",
  "maya@multipoststudio.app",
  "leo@multipoststudio.app",
  "client@alpine.coffee",
];

const org = await db.organization.findUnique({
  where: { slug: DEMO_ORG_SLUG },
  include: { workspaces: { select: { id: true, name: true, slug: true } } },
});

if (!org) {
  console.log(`No org with slug "${DEMO_ORG_SLUG}" — nothing to purge.`);
  await db.$disconnect();
  process.exit(0);
}

const wsIds = org.workspaces.map((w) => w.id);
const demoUsers = await db.user.findMany({
  where: { email: { in: DEMO_USER_EMAILS } },
  select: { id: true, email: true },
});
const demoUserIds = demoUsers.map((u) => u.id);

// SAFETY CHECK — never delete a workspace that holds a real (non-stub) OAuth token.
const accountsInDemo = await db.socialAccount.findMany({
  where: { workspaceId: { in: wsIds } },
  select: { platform: true, handle: true, accessToken: true, workspaceId: true },
});
const realTokensAtRisk = accountsInDemo.filter(
  (a) => a.accessToken && !a.accessToken.startsWith("stub_"),
);

console.log(`Org to delete:  ${org.name} (${org.slug})`);
console.log(`Workspaces:     ${org.workspaces.map((w) => w.name).join(", ")}`);
console.log(`Demo users:     ${demoUsers.map((u) => u.email).join(", ") || "(none found)"}`);

const counts = {
  posts: await db.post.count({ where: { workspaceId: { in: wsIds } } }),
  postMetrics: await db.postMetric.count({ where: { post: { workspaceId: { in: wsIds } } } }),
  socialAccounts: accountsInDemo.length,
  socialChannels: await db.socialChannel.count({ where: { workspaceId: { in: wsIds } } }),
  mediaAssets: await db.mediaAsset.count({ where: { workspaceId: { in: wsIds } } }),
  campaigns: await db.campaign.count({ where: { workspaceId: { in: wsIds } } }),
  subscriptions: await db.subscription.count({ where: { orgId: org.id } }),
  invoices: await db.invoice.count({ where: { orgId: org.id } }),
  memberships: await db.membership.count({ where: { orgId: org.id } }),
};
console.log("\nRows in scope:", counts);

if (realTokensAtRisk.length > 0) {
  console.log("\n*** ABORTING — real OAuth tokens live inside this demo org ***");
  for (const a of realTokensAtRisk) console.log(`  ${a.platform} ${a.handle}`);
  console.log("Move these connections to a real workspace before purging.");
  await db.$disconnect();
  process.exit(1);
}
console.log("\nSafety check passed: no real OAuth tokens inside the demo org.");

if (!EXECUTE) {
  console.log("\nDRY RUN — nothing deleted. Re-run with --execute to apply.");
  await db.$disconnect();
  process.exit(0);
}

// Delete org first: every workspace-scoped table cascades from Organization ->
// Workspace, so this removes posts/media/channels/campaigns/metrics with it.
await db.organization.delete({ where: { id: org.id } });
console.log(`Deleted org ${org.name} and all workspace-scoped data.`);

if (demoUserIds.length) {
  await db.user.deleteMany({ where: { id: { in: demoUserIds } } });
  console.log(`Deleted ${demoUserIds.length} demo users.`);
}

const left = {
  users: await db.user.count(),
  orgs: await db.organization.count(),
  posts: await db.post.count(),
  postMetrics: await db.postMetric.count(),
  socialAccounts: await db.socialAccount.count(),
};
console.log("\nRemaining after purge:", left);
await db.$disconnect();
