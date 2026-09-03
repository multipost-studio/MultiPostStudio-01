/**
 * Populate CmsEntry with editable copies of the built-in marketing content
 * (blog, changelog, customers, a couple of FAQs). Non-destructive: upserts by
 * (collection, slug), touches nothing else. Safe to run against a live DB.
 *
 *   npm run seed:cms
 */
import { PrismaClient } from "@prisma/client";
import { BLOG_POSTS, CHANGELOG, CUSTOMERS } from "../src/app/(marketing)/_data";

const db = new PrismaClient();

const FAQS = [
  { page: "help", q: "Does auto-publish work for every platform?", a: "Where the platform's API allows it, yes. For personal accounts that block automation MultiPost Studio sends a reminder instead." },
  { page: "help", q: "Can a client only see their own workspace?", a: "Yes. Add them as a Client workspace member — they'll see approvals and reports for that workspace only." },
  { page: "pricing", q: "Is there a free plan?", a: "Yes — one workspace, three channels, the composer, calendar, basic analytics and 20 AI credits a month. No card required." },
  { page: "pricing", q: "Can I change plans anytime?", a: "Yes, up or down. Changes are prorated automatically." },
];

async function upsert(collection: string, slug: string, data: unknown, sortIndex: number) {
  const clean = slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  await db.cmsEntry.upsert({
    where: { collection_slug: { collection, slug: clean } },
    create: { collection, slug: clean, data: JSON.stringify(data), sortIndex },
    update: { data: JSON.stringify(data), sortIndex },
  });
}

async function main() {
  let n = 0;
  for (const [i, p] of BLOG_POSTS.entries()) { await upsert("blog", p.slug, p, i); n++; }
  for (const [i, c] of CHANGELOG.entries()) { await upsert("changelog", c.version, c, i); n++; }
  for (const [i, c] of CUSTOMERS.entries()) { await upsert("customer", c.slug, c, i); n++; }
  for (const [i, f] of FAQS.entries()) { await upsert("faq", `${f.page}-${i}`, f, i); n++; }
  console.log(`✔ upserted ${n} CMS entries`);
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
