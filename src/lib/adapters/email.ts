import { env, flags, appUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getSettings } from "@/lib/settings";
import { db } from "@/lib/db";
import { activeTemplate } from "@/lib/email-template-store";
import { render, safeSubject, templateDef } from "@/lib/email-templates";

/** Fill {name} / {link} placeholders in an admin-authored template. */
function fill(tpl: string, vars: { name?: string; link?: string }): string {
  return render(tpl, { name: vars.name ?? "there", link: vars.link ?? "" });
}

/**
 * Transactional email. Real delivery via Resend (RESEND_API_KEY) or Gmail SMTP
 * (GMAIL_USER + GMAIL_APP_PASSWORD) when configured — Resend wins if both are
 * set. With neither, the message is logged (dev) so flows stay testable with
 * no provider.
 */

type SendArgs = { to: string; subject: string; html: string; text: string; /** Which email this is, for the delivery log (e.g. "verify"). */ template?: string };
type SendResult = { ok: boolean; id?: string; stub?: boolean };

let _gmailTransport: import("nodemailer").Transporter | null = null;
async function gmailTransport() {
  if (_gmailTransport) return _gmailTransport;
  const nodemailer = await import("nodemailer");
  _gmailTransport = nodemailer.createTransport({
    service: "gmail",
    auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
  });
  return _gmailTransport;
}

async function sendViaGmail({ to, subject, html, text }: SendArgs): Promise<SendResult> {
  const transport = await gmailTransport();
  try {
    // Gmail rewrites "From" to the authenticated address regardless of what's
    // passed here — set it explicitly so the display name still comes through
    // rather than falling back to whatever EMAIL_FROM's (irrelevant) address is.
    const info = await transport.sendMail({
      from: `MultiPost Studio <${env.GMAIL_USER}>`,
      to,
      subject,
      html,
      text,
    });
    return { ok: true, id: info.messageId };
  } catch (e) {
    logger.error({ to, subject, err: e }, "[email] gmail send failed");
    return { ok: false };
  }
}

async function sendViaResend({ to, subject, html, text }: SendArgs): Promise<SendResult> {
  const { Resend } = await import("resend");
  const resend = new Resend(env.RESEND_API_KEY);
  const res = await resend.emails.send({ from: env.EMAIL_FROM, to, subject, html, text });
  if (res.error) {
    logger.error({ to, subject, err: res.error }, "[email] resend send failed");
    return { ok: false };
  }
  return { ok: true, id: res.data?.id };
}

/**
 * One line per email in the delivery log: which template, the outcome, and the provider's message id so later delivery
 * events can be matched. No address and no content. Fire and forget: logging can never delay or fail the email itself.
 */
function logSend(template: string | undefined, result: SendResult, error?: string): void {
  try {
    void db.emailLog
      .create({ data: { template: (template ?? "other").slice(0, 40), status: result.stub ? "stub" : result.ok ? "sent" : "failed", providerId: result.id ?? null, error: error ? error.slice(0, 200) : null } })
      .catch((err: unknown) => logger.warn({ err }, "email not logged"));
  } catch (err) {
    logger.warn({ err }, "email not logged");
  }
}

async function send(args: SendArgs): Promise<SendResult> {
  if (flags.emailProvider === "resend" || flags.emailProvider === "gmail") {
    let result: SendResult;
    try {
      result = flags.emailProvider === "resend" ? await sendViaResend(args) : await sendViaGmail(args);
    } catch (err) {
      logSend(args.template, { ok: false }, err instanceof Error ? err.message : String(err));
      throw err;
    }
    logSend(args.template, result);
    return result;
  }
  // Never log the rendered body here — for verify/reset emails it contains
  // the raw token, and this is an info-level log any log-drain/dashboard
  // viewer can read (full account takeover with no inbox access needed).
  // Dev testability without a real provider is already covered by
  // `devToken()` in actions/auth.ts, which hands the token back only to the
  // person who requested it, not to anyone watching logs.
  logger.info({ to: args.to, subject: args.subject }, "[email:stub] not sent (no email provider configured)");
  logSend(args.template, { ok: true, stub: true });
  return { ok: true, stub: true };
}

function shell(title: string, bodyHtml: string, cta?: { label: string; url: string }) {
  return `<!doctype html><html><body style="margin:0;background:#faf8f5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#5c5670">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <div style="font-weight:700;font-size:18px;color:#14121f;margin-bottom:24px">MultiPost Studio</div>
    <div style="background:#fff;border:1px solid #e8e3f5;border-radius:18px;padding:28px">
      <h1 style="margin:0 0 12px;font-size:20px;color:#14121f">${title}</h1>
      ${bodyHtml}
      ${
        cta
          ? `<a href="${cta.url}" style="display:inline-block;margin-top:20px;background:#FF4D0E;color:#000;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:999px">${cta.label}</a>
             <p style="margin-top:16px;font-size:12px;color:#9a92ad">Or paste this link: ${cta.url}</p>`
          : ""
      }
    </div>
    <p style="margin-top:24px;font-size:12px;color:#9a92ad">If you didn't request this, you can ignore this email.</p>
  </div></body></html>`;
}

export async function sendVerificationEmail(to: string, token: string, name?: string) {
  const url = appUrl(`/verify?token=${token}`);
  const s = await getSettings();
  // A published version (from /admin/emails) wins over the site setting; either way only the allowed placeholders are filled.
  const t = await activeTemplate("verify");
  const body = fill(t?.body ?? s.emailVerifyBody, { name, link: url });
  const subject = safeSubject(fill(t?.subject ?? s.emailVerifySubject, { name, link: url }));
  return send({
    template: "verify",
    to,
    subject,
    html: shell(
      subject,
      `<p style="margin:0;font-size:14px;line-height:1.6;color:#5c5670;white-space:pre-line">${escapeHtml(body)}</p>`,
      { label: "Verify email", url },
    ),
    text: body,
  });
}

export async function sendPasswordResetEmail(to: string, token: string, name?: string) {
  const url = appUrl(`/reset?token=${token}`);
  const s = await getSettings();
  const t = await activeTemplate("reset");
  const body = fill(t?.body ?? s.emailResetBody, { name, link: url });
  const subject = safeSubject(fill(t?.subject ?? s.emailResetSubject, { name, link: url }));
  return send({
    template: "reset",
    to,
    subject,
    html: shell(
      subject,
      `<p style="margin:0;font-size:14px;line-height:1.6;color:#5c5670;white-space:pre-line">${escapeHtml(body)}</p>`,
      { label: "Choose a new password", url },
    ),
    text: body,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}

/**
 * Team invitation.
 *
 * Two shapes, because the recipient's situation differs:
 *  - brand-new account: carries a set-password link, since inviteMemberAction
 *    creates the account with a random placeholder the invitee never sees.
 *    Without this they cannot sign in at all.
 *  - existing account: no token — they already have a password; the mail just
 *    tells them where they were added.
 */
export async function sendInviteEmail(args: {
  to: string;
  name?: string | null;
  orgName: string;
  inviterName: string;
  role: string;
  /** password_reset token; omit for users who already have a password. */
  token?: string;
  /** Where an existing user should land — normally a /switch link, so they
   *  arrive in the workspace they were added to rather than their own. */
  landingPath?: string;
}) {
  const url = args.token
    ? appUrl(`/reset?token=${args.token}`)
    : appUrl(args.landingPath ?? "/login");
  const key = args.token ? "invite_new" : "invite_existing";
  const def = templateDef(key)!;
  const t = await activeTemplate(key);
  const vars = { name: args.name?.trim() || "there", inviter: args.inviterName, org: args.orgName, role: args.role, link: url };
  const subject = safeSubject(render(t?.subject ?? def.defaultSubject, vars));
  const lines = render(t?.body ?? def.defaultBody, vars);

  return send({
    template: key,
    to: args.to,
    subject,
    html: shell(
      `You've been added to ${escapeHtml(args.orgName)}`,
      `<p style="margin:0;font-size:14px;line-height:1.6;color:#5c5670;white-space:pre-line">${escapeHtml(lines)}</p>`,
      { label: args.token ? "Choose a password" : "Open MultiPost Studio", url },
    ),
    text: lines,
  });
}

export async function sendGenericEmail(args: SendArgs) {
  return send(args);
}

/** In-app notification mirrored to email (respects flags.realEmail — no-op stub in dev). */
export async function sendNotificationEmail(args: {
  /** Delivery-log label; defaults to "notification". */
  template?: string;
  to: string;
  name?: string;
  title: string;
  body: string;
  linkUrl?: string;
}) {
  const url = args.linkUrl
    ? args.linkUrl.startsWith("http")
      ? args.linkUrl
      : `${appUrl()}${args.linkUrl.startsWith("/") ? "" : "/"}${args.linkUrl}`
    : undefined;
  return send({
    template: args.template ?? "notification",
    to: args.to,
    subject: args.title,
    // The body carries user-written text (post titles, mention snippets): escape it, never inline it as HTML.
    html: shell(escapeHtml(args.title), `<p style="margin:0;font-size:14px;line-height:1.55;color:#5c5670">${escapeHtml(args.body)}</p>`, url ? { label: "Open MultiPost Studio", url } : undefined),
    text: `${args.title}\n\n${args.body}${url ? `\n\n${url}` : ""}`,
  });
}
