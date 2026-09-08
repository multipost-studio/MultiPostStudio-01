"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/session";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { saveUpload } from "@/lib/adapters/storage";
import { sendGenericEmail } from "@/lib/adapters/email";
import { getSettings } from "@/lib/settings";
import { flags } from "@/lib/env";
import { logger } from "@/lib/logger";

/** Escape user text before it goes into the HTML body of an email. */
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
import {
  validateFeedback,
  feedbackSubject,
  feedbackBody,
  sanitizeContext,
} from "@/lib/feedback";

/**
 * In-app "Share feedback".
 *
 * Stored as a SupportTicket with kind "feedback" rather than in a table of its
 * own — it is the same thing (a person told us something) and the admin queue
 * already triages these with a status.
 *
 * The ticket is the record of truth. Email to the support address is a
 * convenience on top: if it fails, the feedback is still saved and the user is
 * still thanked, because losing what someone took the trouble to write is
 * worse than a missing notification.
 */

/** Screenshots only — an arbitrary upload channel is not what this is for. */
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024;

export async function submitFeedbackAction(_prev: unknown, formData: FormData) {
  const ctx = await requireWorkspace();

  const input = {
    goal: String(formData.get("goal") ?? ""),
    problem: String(formData.get("problem") ?? ""),
    context: sanitizeContext(String(formData.get("context") ?? "")),
  };

  const errors = validateFeedback(input);
  if (errors.length > 0) return { ok: false, error: errors[0].message };

  // Per user, not per IP: this is authenticated, and a shared office IP
  // shouldn't stop a colleague reporting a bug.
  try {
    await enforceRateLimit(`feedback:${ctx.user.id}`, 5, 3_600_000);
  } catch (e) {
    if (e instanceof RateLimitError) {
      return { ok: false, error: "You've sent a few already — try again in a little while." };
    }
    throw e;
  }

  // The form only offers an attachment when storage is configured, but a
  // hand-made POST could still include one, and saveUpload throws on
  // serverless without S3.
  let attachmentUrl: string | null = null;
  const file = formData.get("attachment");
  if (flags.realStorage && file instanceof File && file.size > 0) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return { ok: false, error: "Attach a PNG, JPEG, WebP or GIF image." };
    }
    if (file.size > MAX_BYTES) return { ok: false, error: "That image is larger than 5 MB." };
    try {
      attachmentUrl = (await saveUpload(file)).url;
    } catch (err) {
      // Don't lose the words because the picture failed.
      logger.error({ err, userId: ctx.user.id }, "feedback attachment upload failed");
    }
  }

  const ticket = await db.supportTicket.create({
    data: {
      orgId: ctx.active.org.id,
      userId: ctx.user.id,
      kind: "feedback",
      subject: feedbackSubject(input.goal),
      body: feedbackBody(input),
      context: input.context,
      attachmentUrl,
      status: "open",
    },
  });

  const to = (await getSettings()).supportEmail;
  const meta = [
    `From: ${ctx.user.name ?? "Unknown"} <${ctx.user.email}>`,
    `Workspace: ${ctx.active.workspace.name} (${ctx.active.org.name})`,
    input.context ? `Sent from: ${input.context}` : null,
    attachmentUrl ? `Attachment: ${attachmentUrl}` : null,
  ].filter((l): l is string => !!l);

  const res = await sendGenericEmail({
    to,
    subject: feedbackSubject(input.goal),
    text: [...meta, "", feedbackBody(input)].join("\n"),
    // Everything here is user-supplied and lands in a mail client, so it is
    // escaped rather than interpolated raw.
    html:
      meta.map((l) => `<p>${esc(l)}</p>`).join("") +
      `<pre style="white-space:pre-wrap;font-family:inherit">${esc(feedbackBody(input))}</pre>`,
  }).catch((err) => {
    logger.error({ err, ticketId: ticket.id }, "feedback email failed");
    return { ok: false as const };
  });
  if (!res.ok) logger.warn({ ticketId: ticket.id }, "feedback saved but not emailed");

  revalidatePath("/admin/support");
  return { ok: true, message: "Thanks — we've got it." };
}
