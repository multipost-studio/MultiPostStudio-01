import { env, flags, appUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getSettings } from "@/lib/settings";

/** Fill {name} / {link} placeholders in an admin-authored template. */
function fill(tpl: string, vars: { name?: string; link?: string }): string {
  return tpl
    .replaceAll("{name}", vars.name ?? "there")
    .replaceAll("{link}", vars.link ?? "");
}

/**
 * Transactional email. Real delivery via Resend (RESEND_API_KEY) or Gmail SMTP
 * (GMAIL_USER + GMAIL_APP_PASSWORD) when configured — Resend wins if both are
 * set. With neither, the message is logged (dev) so flows stay testable with
 * no provider.
 */

type SendArgs = { to: string; subject: string; html: string; text: string };

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

async function sendViaGmail({ to, subject, html, text }: SendArgs): Promise<{ ok: boolean; id?: string }> {
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

async function sendViaResend({ to, subject, html, text }: SendArgs): Promise<{ ok: boolean; id?: string }> {
  const { Resend } = await import("resend");
  const resend = new Resend(env.RESEND_API_KEY);
  const res = await resend.emails.send({ from: env.EMAIL_FROM, to, subject, html, text });
  if (res.error) {
    logger.error({ to, subject, err: res.error }, "[email] resend send failed");
    return { ok: false };
  }
  return { ok: true, id: res.data?.id };
}

async function send(args: SendArgs): Promise<{ ok: boolean; id?: string }> {
  if (flags.emailProvider === "resend") return sendViaResend(args);
  if (flags.emailProvider === "gmail") return sendViaGmail(args);
  // Never log the rendered body here — for verify/reset emails it contains
  // the raw token, and this is an info-level log any log-drain/dashboard
  // viewer can read (full account takeover with no inbox access needed).
  // Dev testability without a real provider is already covered by
  // `devToken()` in actions/auth.ts, which hands the token back only to the
  // person who requested it, not to anyone watching logs.
  logger.info({ to: args.to, subject: args.subject }, "[email:stub] not sent (no email provider configured)");
  return { ok: true };
}

function shell(title: string, bodyHtml: string, cta?: { label: string; url: string }) {
  return `<!doctype html><html><body style="margin:0;background:#fffaf6;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#6e5257">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <div style="font-weight:700;font-size:18px;color:#2a1518;margin-bottom:24px">MultiPost Studio</div>
    <div style="background:#fff;border:1px solid #eedfd9;border-radius:16px;padding:28px">
      <h1 style="margin:0 0 12px;font-size:20px;color:#2a1518">${title}</h1>
      ${bodyHtml}
      ${
        cta
          ? `<a href="${cta.url}" style="display:inline-block;margin-top:20px;background:#6f262c;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:999px">${cta.label}</a>
             <p style="margin-top:16px;font-size:12px;color:#9c858a">Or paste this link: ${cta.url}</p>`
          : ""
      }
    </div>
    <p style="margin-top:24px;font-size:12px;color:#9c858a">If you didn't request this, you can ignore this email.</p>
  </div></body></html>`;
}

export async function sendVerificationEmail(to: string, token: string, name?: string) {
  const url = appUrl(`/verify?token=${token}`);
  const s = await getSettings();
  const body = fill(s.emailVerifyBody, { name, link: url });
  return send({
    to,
    subject: s.emailVerifySubject,
    html: shell(
      s.emailVerifySubject,
      `<p style="margin:0;font-size:14px;line-height:1.6;color:#6e5257;white-space:pre-line">${escapeHtml(body)}</p>`,
      { label: "Verify email", url },
    ),
    text: body,
  });
}

export async function sendPasswordResetEmail(to: string, token: string, name?: string) {
  const url = appUrl(`/reset?token=${token}`);
  const s = await getSettings();
  const body = fill(s.emailResetBody, { name, link: url });
  return send({
    to,
    subject: s.emailResetSubject,
    html: shell(
      s.emailResetSubject,
      `<p style="margin:0;font-size:14px;line-height:1.6;color:#6e5257;white-space:pre-line">${escapeHtml(body)}</p>`,
      { label: "Choose a new password", url },
    ),
    text: body,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}

export async function sendGenericEmail(args: SendArgs) {
  return send(args);
}

/** In-app notification mirrored to email (respects flags.realEmail — no-op stub in dev). */
export async function sendNotificationEmail(args: {
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
    to: args.to,
    subject: args.title,
    html: shell(args.title, `<p style="margin:0;font-size:14px;line-height:1.55;color:#6e5257">${args.body}</p>`, url ? { label: "Open MultiPost Studio", url } : undefined),
    text: `${args.title}\n\n${args.body}${url ? `\n\n${url}` : ""}`,
  });
}
