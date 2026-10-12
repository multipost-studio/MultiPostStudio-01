"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/events";
import { requireAdminPermission } from "@/lib/session";
import { parseReason } from "@/lib/admin-reason";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { invalidateEmailTemplates } from "@/lib/email-template-store";
import { SAMPLE_VARS, isTemplateKey, render, safeSubject, templateDef, validateTemplate } from "@/lib/email-templates";
import { sendGenericEmail } from "@/lib/adapters/email";

/**
 * Editable lifecycle emails. Publishing never edits a version in place: it adds the next version and makes it the active
 * one, so the history of what customers were sent is kept and any earlier version can be put back. Resetting returns to the
 * built-in text. Every change needs a reason and is audited; the email text itself is not copied into the audit log.
 */
type Result = { ok: true; message: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

async function publish(key: string, subject: string, body: string, note: string | null, actorId: string): Promise<number> {
  const last = await db.emailTemplateVersion.findFirst({ where: { key }, orderBy: { version: "desc" }, select: { version: true } });
  const version = (last?.version ?? 0) + 1;
  await db.$transaction([
    db.emailTemplateVersion.updateMany({ where: { key, isActive: true }, data: { isActive: false } }),
    db.emailTemplateVersion.create({ data: { key, version, subject, body, note, isActive: true, createdById: actorId } }),
  ]);
  invalidateEmailTemplates();
  return version;
}

export async function publishEmailTemplateAction(raw: { key: unknown; subject: unknown; body: unknown }, reasonInput: unknown): Promise<Result> {
  const admin = await requireAdminPermission("marketing.manage");
  const why = parseReason(reasonInput);
  if (!why.ok) return fail(why.error);
  const key = raw?.key;
  if (!isTemplateKey(key)) return fail("Unknown template");
  const errors = validateTemplate(key, raw.subject, raw.body);
  if (errors.length) return fail(errors[0]);
  const version = await publish(key, (raw.subject as string).trim(), (raw.body as string).trim(), why.reason, admin.id);
  await logAudit({ actorId: admin.id, action: "admin.email_template_published", targetType: "email_template", targetId: key, reason: why.reason, metadata: { version } });
  revalidatePath("/admin/emails");
  return { ok: true, message: `Version ${version} is live` };
}

/** Put an earlier version back: it is published again as the newest version, so nothing in the history changes. */
export async function restoreEmailTemplateVersionAction(versionId: string, reasonInput: unknown): Promise<Result> {
  const admin = await requireAdminPermission("marketing.manage");
  const why = parseReason(reasonInput);
  if (!why.ok) return fail(why.error);
  if (typeof versionId !== "string" || !versionId) return fail("Invalid request");
  const old = await db.emailTemplateVersion.findUnique({ where: { id: versionId } });
  if (!old || !isTemplateKey(old.key)) return fail("That version no longer exists");
  // An old version is checked again against today's rules, so a restore can never publish something that would now be refused.
  const errors = validateTemplate(old.key, old.subject, old.body);
  if (errors.length) return fail(`That version can't be restored: ${errors[0]}`);
  const version = await publish(old.key, old.subject, old.body, `Restored version ${old.version}: ${why.reason}`.slice(0, 300), admin.id);
  await logAudit({ actorId: admin.id, action: "admin.email_template_restored", targetType: "email_template", targetId: old.key, reason: why.reason, metadata: { restoredVersion: old.version, version } });
  revalidatePath("/admin/emails");
  return { ok: true, message: `Version ${old.version} restored as version ${version}` };
}

/** Back to the built-in text. The versions stay in the history. */
export async function resetEmailTemplateAction(key: unknown, reasonInput: unknown): Promise<Result> {
  const admin = await requireAdminPermission("marketing.manage");
  const why = parseReason(reasonInput);
  if (!why.ok) return fail(why.error);
  if (!isTemplateKey(key)) return fail("Unknown template");
  const res = await db.emailTemplateVersion.updateMany({ where: { key, isActive: true }, data: { isActive: false } });
  if (res.count === 0) return fail("This email is already using the built-in text");
  invalidateEmailTemplates();
  await logAudit({ actorId: admin.id, action: "admin.email_template_reset", targetType: "email_template", targetId: key, reason: why.reason });
  revalidatePath("/admin/emails");
  return { ok: true, message: "Back to the built-in text" };
}

/** Send the current text of a template, filled with sample values, to the signed-in admin's own address. Never to anyone else. */
export async function sendTestEmailAction(key: unknown, draft?: { subject: unknown; body: unknown }): Promise<Result> {
  const admin = await requireAdminPermission("marketing.manage");
  if (!isTemplateKey(key)) return fail("Unknown template");
  const def = templateDef(key)!;
  let subject = def.defaultSubject;
  let body = def.defaultBody;
  if (draft) {
    const errors = validateTemplate(key, draft.subject, draft.body);
    if (errors.length) return fail(errors[0]);
    subject = (draft.subject as string).trim();
    body = (draft.body as string).trim();
  }
  if (!admin.email) return fail("Your account has no email address");
  try {
    await enforceRateLimit(`email-test:${admin.id}`, 5, 3_600_000);
  } catch (e) {
    if (e instanceof RateLimitError) return fail("You have sent a few test emails already. Try again in an hour.");
    throw e;
  }
  const text = render(body, SAMPLE_VARS);
  const res = await sendGenericEmail({
    template: "test",
    to: admin.email,
    subject: `[Test] ${safeSubject(render(subject, SAMPLE_VARS))}`,
    html: `<p style="font-size:14px;line-height:1.6;white-space:pre-line">${escapeHtml(text)}</p><p style="font-size:12px;color:#888">This is a test with sample values. Nothing was sent to a customer.</p>`,
    text: `${text}\n\n(This is a test with sample values.)`,
  });
  return res.ok ? { ok: true, message: `Test sent to ${admin.email}` } : fail("The email provider didn't accept it");
}
