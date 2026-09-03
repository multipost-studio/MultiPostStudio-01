/**
 * Populate CmsEntry with editable copies of every built-in marketing content
 * block. Non-destructive: upserts by (collection, slug), touches nothing else.
 * Safe to run against a live DB.
 *
 *   npm run seed:cms
 */
import { PrismaClient } from "@prisma/client";
import {
  BLOG_POSTS,
  CHANGELOG,
  CUSTOMERS,
  FEATURE_PAGES,
  SOLUTION_PAGES,
  GUIDES,
  JOBS,
  ROADMAP,
  PRODUCT_LINKS,
  SOLUTION_LINKS,
  RESOURCE_LINKS,
  COMPANY_LINKS,
  LEGAL_LINKS,
} from "../src/app/(marketing)/_data";

const db = new PrismaClient();

const FAQS = [
  { page: "help", q: "Does auto-publish work for every platform?", a: "Where the platform's API allows it, yes. For personal accounts that block automation MultiPost Studio sends a reminder instead." },
  { page: "help", q: "Can a client only see their own workspace?", a: "Yes. Add them as a Client workspace member — they'll see approvals and reports for that workspace only." },
  { page: "pricing", q: "Is there a free plan?", a: "Yes — one workspace, three channels, the composer, calendar, basic analytics and 20 AI credits a month. No card required." },
  { page: "pricing", q: "Can I change plans anytime?", a: "Yes, up or down. Changes are prorated automatically." },
];

async function upsert(collection: string, slugRaw: string, data: unknown, sortIndex: number) {
  const slug = slugRaw.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  await db.cmsEntry.upsert({
    where: { collection_slug: { collection, slug } },
    create: { collection, slug, data: JSON.stringify(data), sortIndex },
    update: { data: JSON.stringify(data), sortIndex },
  });
}

async function main() {
  let n = 0;
  const rows: [string, string, unknown, number][] = [
    ...BLOG_POSTS.map((p, i): [string, string, unknown, number] => ["blog", p.slug, p, i]),
    ...CHANGELOG.map((c, i): [string, string, unknown, number] => ["changelog", c.version, c, i]),
    ...CUSTOMERS.map((c, i): [string, string, unknown, number] => ["customer", c.slug, c, i]),
    ...Object.entries(FEATURE_PAGES).map(([slug, v], i): [string, string, unknown, number] => ["feature", slug, v, i]),
    ...Object.entries(SOLUTION_PAGES).map(([slug, v], i): [string, string, unknown, number] => ["solution", slug, v, i]),
    ...GUIDES.map((g, i): [string, string, unknown, number] => ["guide", g.slug, g, i]),
    ...JOBS.map((j, i): [string, string, unknown, number] => ["job", j.slug, j, i]),
    ["roadmap", "roadmap", ROADMAP, 0],
    ["navlink", "product", { items: PRODUCT_LINKS }, 0],
    ["navlink", "solution", { items: SOLUTION_LINKS }, 1],
    ["navlink", "resource", { items: RESOURCE_LINKS }, 2],
    ["navlink", "company", { items: COMPANY_LINKS }, 3],
    ["navlink", "legal", { items: LEGAL_LINKS }, 4],
    ...FAQS.map((f, i): [string, string, unknown, number] => ["faq", `${f.page}-${i}`, f, i]),
  ];
  for (const [collection, slug, data, sortIndex] of rows) {
    await upsert(collection, slug, data, sortIndex);
    n++;
  }
  console.log(`✔ upserted ${n} CMS entries across blog / changelog / customer / feature / solution / guide / job / roadmap / navlink / faq`);
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
