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
 * Transactional email. Real delivery via Resend when RESEND_API_KEY is set;
 * otherwise the message is logged (dev) so flows stay testable with no provider.
 */

type SendArgs = { to: string; subject: string; html: string; text: string };

async function send({ to, subject, html, text }: SendArgs): Promise<{ ok: boolean; id?: string }> {
  if (!flags.realEmail) {
    logger.info({ to, subject, preview: text.slice(0, 200) }, "[email:stub] not sent (no RESEND_API_KEY)");
    return { ok: true };
  }
  const { Resend } = await import("resend");
  const resend = new Resend(env.RESEND_API_KEY);
  const res = await resend.emails.send({ from: env.EMAIL_FROM, to, subject, html, text });
  if (res.error) {
    logger.error({ to, subject, err: res.error }, "[email] send failed");
    return { ok: false };
  }
  return { ok: true, id: res.data?.id };
}

function shell(title: string, bodyHtml: string, cta?: { label: string; url: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f2f4f3;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1c2b26">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <div style="font-weight:700;font-size:18px;color:#0a0908;margin-bottom:24px">MultiPost Studio</div>
    <div style="background:#fff;border:1px solid #e0e2e1;border-radius:16px;padding:28px">
      <h1 style="margin:0 0 12px;font-size:20px;color:#0a0908">${title}</h1>
      ${bodyHtml}
      ${
        cta
          ? `<a href="${cta.url}" style="display:inline-block;margin-top:20px;background:#c22c2c;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:999px">${cta.label}</a>
             <p style="margin-top:16px;font-size:12px;color:#8a8987">Or paste this link: ${cta.url}</p>`
          : ""
      }
    </div>
    <p style="margin-top:24px;font-size:12px;color:#8a8987">If you didn't request this, you can ignore this email.</p>
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
      `<p style="margin:0;font-size:14px;line-height:1.6;color:#52625b;white-space:pre-line">${escapeHtml(body)}</p>`,
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
      `<p style="margin:0;font-size:14px;line-height:1.6;color:#52625b;white-space:pre-line">${escapeHtml(body)}</p>`,
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
