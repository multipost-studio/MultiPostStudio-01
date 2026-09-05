/**
 * Sync Plan rows in the DB from PLAN_CATALOG (src/lib/constants.ts).
 *
 *   node scripts/sync-plan-entitlements.mjs            # dry run
 *   node scripts/sync-plan-entitlements.mjs --execute  # apply
 *
 * The Plan table is the runtime source of truth (so /admin/plans edits take
 * effect without a deploy), and PLAN_CATALOG is its seed. When a row exists but
 * its entitlements are empty, getPlan() does NOT fall back to the catalog — it
 * returns the empty row, so every hasEntitlement() check fails and paid
 * features are locked for everyone. This repairs that.
 *
 * Only touches entitlements/features/limits. Prices are left alone — those are
 * a business decision and may have been edited deliberately in the admin UI.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const db = new PrismaClient();
const EXECUTE = process.argv.includes("--execute");

// Pull PLAN_CATALOG out of the TS source without a build step.
const src = readFileSync("src/lib/constants.ts", "utf8");
function groupKeys(name) {
  const m = src.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  if (!m) throw new Error(`could not find ${name}`);
  return m[1];
}
function expand(name, seen = new Set()) {
  if (seen.has(name)) return [];
  seen.add(name);
  const body = groupKeys(name);
  const keys = [...body.matchAll(/"([a-z0-9_]+)"/g)].map((x) => x[1]);
  const spreads = [...body.matchAll(/\.\.\.([A-Z_]+)/g)].map((x) => x[1]);
  return [...spreads.flatMap((s) => expand(s, seen)), ...keys];
}
const ALL = [...new Set([...expand("FREE_ENT"), ...expand("PRO_ENT"), ...expand("TEAM_ENT"), ...expand("AGENCY_ENT")])];
const BY_PLAN = {
  free: [...new Set(expand("FREE_ENT"))],
  pro: [...new Set(expand("PRO_ENT"))],
  team: [...new Set(expand("TEAM_ENT"))],
  agency: [...new Set(expand("AGENCY_ENT"))],
  enterprise: ALL, // enterprise uses ALL_ENTITLEMENTS in the catalog
};

for (const [key, ents] of Object.entries(BY_PLAN)) {
  const row = await db.plan.findUnique({ where: { key } });
  if (!row) {
    console.log(`${key.padEnd(11)} MISSING in DB — skipping`);
    continue;
  }
  let current = [];
  try { current = JSON.parse(row.entitlements || "[]"); } catch {}
  console.log(`${key.padEnd(11)} ${String(current.length).padStart(2)} -> ${String(ents.length).padStart(2)} entitlements`);
  if (EXECUTE) {
    await db.plan.update({ where: { key }, data: { entitlements: JSON.stringify(ents) } });
  }
}

console.log(EXECUTE ? "\nApplied." : "\nDRY RUN — nothing written. Re-run with --execute.");
await db.$disconnect();
