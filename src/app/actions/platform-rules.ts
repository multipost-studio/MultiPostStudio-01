"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/session";
import { logAudit } from "@/lib/events";
import { logger } from "@/lib/logger";
import { buildRuleSet, DEFAULT_RULES, type PlatformRule, type RuleOverride } from "@/lib/platform-rules";
import { invalidatePlatformRules, rowToOverride } from "@/lib/platform-rules-db";

export type RuleResult = { ok: true; message: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const KINDS = ["HARD_LIMIT", "API_LIMIT", "ACCOUNT_LIMIT", "RECOMMENDATION"] as const;

const updateSchema = z.object({
  id: z.string().min(1).max(120),
  value: z.number().int("Use a whole number").min(0).max(1_000_000).optional(),
  enabled: z.boolean().optional(),
  kind: z.enum(KINDS).optional(),
  verification: z.enum(["verified", "needs_verification"]).optional(),
  sourceName: z.string().trim().max(200).optional(),
  sourceUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https:\/\//i.test(v), "Source URL must start with https://")
    .optional(),
  /** Rule-set version label, e.g. "2026-10". */
  version: z.string().trim().regex(/^\d{4}-\d{2}$/, "Use YYYY-MM, e.g. 2026-10").optional(),
  /** Stamp lastVerifiedAt = today. */
  markVerified: z.boolean().optional(),
  reason: z.string().trim().min(5, "Say why this is changing (5+ characters)").max(500),
});

export type UpdateRuleInput = z.input<typeof updateSchema>;

function snapshot(r: PlatformRule) {
  return {
    value: r.value,
    enabled: r.enabled,
    kind: r.kind,
    verification: r.verification,
    source: r.source,
    version: r.version,
    lastVerifiedAt: r.lastVerifiedAt,
  };
}

function effective(id: string, override: RuleOverride | null): PlatformRule | null {
  return buildRuleSet(DEFAULT_RULES, override ? [override] : []).rules.find((r) => r.id === id) ?? null;
}

async function currentOverride(id: string): Promise<RuleOverride | null> {
  const row = await db.platformRule.findUnique({ where: { id } });
  return row ? rowToOverride(row) : null;
}

function refresh() {
  invalidatePlatformRules();
  revalidatePath("/admin/platform-rules");
}

/**
 * Change one platform rule. The code default is never modified: an override row
 * is written, a revision (old → new, who, why, source, version) is appended, and
 * the audit log gets an entry. Admins only — workspace users cannot reach this.
 */
export async function updatePlatformRuleAction(input: UpdateRuleInput): Promise<RuleResult> {
  const admin = await requirePlatformAdmin();

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message;
    return { ok: false, error: Object.values(fieldErrors)[0] ?? "Invalid change", fieldErrors };
  }
  const d = parsed.data;

  const base = DEFAULT_RULES.find((r) => r.id === d.id);
  if (!base) return { ok: false, error: "Unknown rule" };

  try {
    const existing = await currentOverride(d.id);
    const before = effective(d.id, existing)!;

    const next: RuleOverride = {
      ...(existing ?? { id: d.id }),
      ...(d.value !== undefined ? { value: d.value } : {}),
      ...(d.enabled !== undefined ? { enabled: d.enabled } : {}),
      ...(d.kind !== undefined ? { kind: d.kind } : {}),
      ...(d.verification !== undefined ? { verification: d.verification } : {}),
      ...(d.version !== undefined ? { version: d.version } : {}),
      ...(d.sourceName !== undefined || d.sourceUrl !== undefined
        ? { source: { name: d.sourceName ?? before.source.name, url: d.sourceUrl ?? before.source.url } }
        : {}),
      ...(d.markVerified ? { lastVerifiedAt: new Date().toISOString().slice(0, 10) } : {}),
    };
    const after = effective(d.id, next)!;

    if (JSON.stringify(snapshot(before)) === JSON.stringify(snapshot(after))) {
      return { ok: false, error: "Nothing changed" };
    }

    await db.$transaction([
      db.platformRule.upsert({
        where: { id: d.id },
        create: {
          id: d.id,
          platform: base.platform,
          value: next.value ?? null,
          enabled: next.enabled ?? null,
          kind: next.kind ?? null,
          verification: next.verification ?? null,
          version: next.version ?? null,
          sourceName: next.source?.name ?? null,
          sourceUrl: next.source?.url ?? null,
          lastVerifiedAt: next.lastVerifiedAt ? new Date(next.lastVerifiedAt) : null,
          updatedBy: admin.id,
        },
        update: {
          value: next.value ?? null,
          enabled: next.enabled ?? null,
          kind: next.kind ?? null,
          verification: next.verification ?? null,
          version: next.version ?? null,
          sourceName: next.source?.name ?? null,
          sourceUrl: next.source?.url ?? null,
          lastVerifiedAt: next.lastVerifiedAt ? new Date(next.lastVerifiedAt) : null,
          updatedBy: admin.id,
        },
      }),
      db.platformRuleRevision.create({
        data: {
          ruleId: d.id,
          platform: base.platform,
          changedBy: admin.id,
          reason: d.reason,
          oldValue: JSON.stringify(snapshot(before)),
          newValue: JSON.stringify(snapshot(after)),
          version: after.version,
          sourceName: after.source.name,
          sourceUrl: after.source.url,
        },
      }),
    ]);

    await logAudit({
      actorId: admin.id,
      action: "admin.platform_rule_updated",
      targetType: "platform_rule",
      targetId: d.id,
      metadata: { platform: base.platform, old: snapshot(before), new: snapshot(after), reason: d.reason, version: after.version, source: after.source },
    });
    refresh();
    return { ok: true, message: "Rule updated" };
  } catch (err) {
    logger.error({ err, ruleId: d.id }, "platform rule update failed");
    return { ok: false, error: "Couldn't save the rule. Check that the latest database migration has been applied." };
  }
}

/** Drop an admin override and return the rule to its code default. Recorded like any other change. */
export async function resetPlatformRuleAction(id: string, reason: string): Promise<RuleResult> {
  const admin = await requirePlatformAdmin();
  const why = reason.trim();
  if (why.length < 5) return { ok: false, error: "Say why this is changing (5+ characters)", fieldErrors: { reason: "Say why this is changing (5+ characters)" } };
  const base = DEFAULT_RULES.find((r) => r.id === id);
  if (!base) return { ok: false, error: "Unknown rule" };

  try {
    const existing = await currentOverride(id);
    if (!existing) return { ok: false, error: "This rule already uses its default" };
    const before = effective(id, existing)!;
    const after = base;

    await db.$transaction([
      db.platformRule.delete({ where: { id } }),
      db.platformRuleRevision.create({
        data: {
          ruleId: id,
          platform: base.platform,
          changedBy: admin.id,
          reason: why,
          oldValue: JSON.stringify(snapshot(before)),
          newValue: JSON.stringify(snapshot(after)),
          version: after.version,
          sourceName: after.source.name,
          sourceUrl: after.source.url,
        },
      }),
    ]);
    await logAudit({
      actorId: admin.id,
      action: "admin.platform_rule_reset",
      targetType: "platform_rule",
      targetId: id,
      metadata: { platform: base.platform, old: snapshot(before), new: snapshot(after), reason: why },
    });
    refresh();
    return { ok: true, message: "Rule reset to default" };
  } catch (err) {
    logger.error({ err, ruleId: id }, "platform rule reset failed");
    return { ok: false, error: "Couldn't reset the rule." };
  }
}
