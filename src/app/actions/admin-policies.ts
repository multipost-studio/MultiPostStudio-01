"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/events";
import { requireAdminPermission } from "@/lib/session";
import { POLICY_TYPES, SUMMARY_MAX, TITLE_MAX, VERSION_RE, safePolicyUrl } from "@/lib/policy-versions";
import { parseDay } from "@/lib/date-range";

/**
 * Publish a new version of a policy document. Append-only: there is no edit or delete, so the record of what was in force
 * on a given day cannot be rewritten. A correction is a new version. This records versions only; it does not collect or
 * track customers' acceptance.
 */
type Result = { ok: true; message: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

const input = z.object({
  type: z.enum(POLICY_TYPES.map((t) => t.id) as [string, ...string[]]),
  version: z.string().trim(),
  title: z.string().trim().min(3, "Give it a title").max(TITLE_MAX),
  url: z.string().trim().optional(),
  summary: z.string().trim().min(8, "Summarise what changed (at least 8 characters)").max(SUMMARY_MAX),
  effectiveOn: z.string(),
});

export async function publishPolicyVersionAction(raw: unknown): Promise<Result> {
  const admin = await requireAdminPermission("privacy.manage");
  const p = input.safeParse(raw);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Invalid request");
  if (!VERSION_RE.test(p.data.version)) return fail("Version can use letters, numbers, dots, dashes and underscores (up to 20 characters)");
  const effectiveAt = parseDay(p.data.effectiveOn);
  if (!effectiveAt) return fail("Pick a valid effective date");
  if (effectiveAt.getTime() > Date.now() + 730 * 86_400_000) return fail("The effective date is more than two years away");
  let url: string | null = null;
  if (p.data.url) {
    url = safePolicyUrl(p.data.url);
    if (!url) return fail("The link must be a path on this site (like /terms) or an https address");
  }

  try {
    const row = await db.policyVersion.create({
      data: { type: p.data.type, version: p.data.version, title: p.data.title, url, summary: p.data.summary, effectiveAt, publishedById: admin.id },
      select: { id: true },
    });
    await logAudit({ actorId: admin.id, action: "admin.policy_published", targetType: "policy", targetId: row.id, metadata: { type: p.data.type, version: p.data.version, effectiveOn: p.data.effectiveOn } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return fail("That version number is already published. A correction needs a new version number.");
    throw err;
  }
  revalidatePath("/admin/policies");
  return { ok: true, message: "Version published" };
}
